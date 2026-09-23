"""
entrance -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Per Design Spec Sec 3.2, `entrance` depends on `bookings` only -- there is
no dependency the other way, and no dependency on `refunds`/`settlement`.
Everything below reads/writes `apps.bookings.models.Booking` fields that
are declared there (that model's own docstring: "populated by
apps.entrance") but never writes to `refunds`/`settlement` state itself.
UAT round 1 moved headcount/category correction out of this module
entirely and into `apps.bookings.services` (Museum-Manager-only,
before check-in rather than after) -- see `check_in_booking`'s own
docstring for the full policy change. This module now has two gate-side
actions, both Cashier-only: check a matching booking in
(`check_in_booking`), or flag a mismatched one for the Manager
(`flag_booking_mismatch`) -- never fix a mismatch here itself. This
module still never calls into `apps.refunds` or `apps.payments` directly
(Sec 3.2's dependency direction) -- payment is out of scope here
entirely.

Authorization (Cashier-only) is the view layer's job (permission classes),
mirroring `bookings/services.py`'s own division of labor -- this module
assumes the caller has already been authorized. What this module *does*
check is booking state (only a `Pending` booking is checkable-in/
flaggable) and, for check-in, that no mismatch flag is still open.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.bookings.models import Booking, BookingItem
from apps.core.exceptions import Conflict
from apps.core.services import write_audit_log

# --------------------------------------------------------------------------
# Lookup (FR-TICKET-001, FR-TICKET-004)
# --------------------------------------------------------------------------


def lookup_booking_by_reference(*, reference):
    """Implements `GET /bookings/lookup` (FR-TICKET-001). The same text
    field accepts either a typed reference or a keyboard-wedge QR scan
    (ADR-007) -- this function has no way to tell the two apart, and
    doesn't need to.

    FR-TICKET-004 ("if a Visitor cannot present their booking reference,
    the Cashier can look the booking up by name/payment details and
    confirm it manually") is deliberately *not* a second code path here --
    the Cashier is Staff and already has `GET /bookings` (with its
    status/visitDate/bookingType filters) available to find the booking
    manually; once found, the same `check_in_booking` below is used
    regardless of how the booking was located.
    """
    reference = (reference or "").strip().upper()
    if not reference:
        raise ValidationError({"reference": "This query parameter is required."})

    try:
        # select_related("visitor") -- BookingSerializer reads
        # visitor.full_name/email/phone, needed here for the Cashier to
        # confirm she has the right person at the gate.
        return Booking.objects.select_related("visitor").get(reference=reference)
    except Booking.DoesNotExist:
        raise NotFound("No booking found for that reference.")


# --------------------------------------------------------------------------
# Check-in / headcount reconciliation (FR-TICKET-001 - FR-TICKET-003, 005)
# --------------------------------------------------------------------------


@transaction.atomic
def check_in_booking(*, booking, actor):
    """Implements `POST /bookings/{id}/check-in`.

    UAT round 1 moved headcount/category correction from the Cashier to
    the Museum Manager, and moved it from *after* check-in to *before*
    it (Document 02 Sec 2.5's policy update): the Cashier's own job at
    the gate is now narrow -- count the party against what's booked,
    then either check in (matches) or call `flag_booking_mismatch`
    below (doesn't) -- she has no means to fix a mismatch herself any
    more. By the time this function is reachable at all, the booking's
    numbers are already correct: either they matched from the start, or
    a Manager has already corrected them (`apps.bookings.services.
    correct_booking_category`/`apply_booking_corrections`/
    `add_booking_item`) and any resulting top-up/refund has settled.

    This is why there is no `attended_items` input any more, and no
    per-category reconciliation to validate: every `BookingItem`'s
    `attended_quantity` is simply set to its own `quantity`, because a
    mismatch physically cannot reach this call. The previous version of
    this function took a Cashier-supplied per-item attended count
    precisely because *she* was the one reconciling headcount at the
    gate ("the Cashier, standing at the gate, knows exactly which
    ticket-holders didn't show up") -- that rationale belongs to the
    Manager's pre-check-in correction step now, not to this function,
    which just records the (already-correct) numbers.

    - FR-TICKET-001: records the actual number of visitors who showed up,
      per category -- always equal to what was booked now, by
      construction (see above).
    - FR-TICKET-002: the booking becomes `Visited`.
    - FR-TICKET-003: only a `Pending` booking is checkable-in -- once
      this succeeds the booking is no longer `Pending` and the Visitor
      can no longer cancel/reschedule it themselves.
    - A booking with an open mismatch flag (`flagged_mismatch_at` set by
      `flag_booking_mismatch` below, not yet cleared by a Manager
      correction) is rejected with `Conflict` -- exactly the "does not
      proceed until the Manager has fixed it" rule this whole round is
      about.
    - FR-TICKET-005 (no item's attended quantity may exceed its own
      booked quantity) is still true here, unconditionally, since
      attended is always set equal to booked -- the guard itself now
      lives entirely in the Manager's correction functions, the only
      places a quantity can still change; the DB-level CheckConstraints
      (`booking_item_attended_within_quantity`,
      `booking_attended_within_booked`) remain as belt-and-braces.

    `Booking.attended_quantity` is still written, as the denormalized
    sum across every item, for every existing consumer that only ever
    needed the booking-level total (headcount displays, the "is this
    booking checked in" flag).
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("This booking is not in a checkable-in state.")

    if booking.flagged_mismatch_at is not None:
        raise Conflict(
            "This booking has been flagged for a headcount/category mismatch and is "
            "awaiting a Museum Manager correction before it can be checked in."
        )

    items = list(booking.items.all())
    for item in items:
        item.attended_quantity = item.quantity
    BookingItem.objects.bulk_update(items, ["attended_quantity"])

    booking.attended_quantity = booking.booked_quantity
    booking.status = Booking.Status.VISITED
    booking.checked_in_at = timezone.now()
    booking.checked_in_by_user_id = actor
    booking.save(
        update_fields=[
            "attended_quantity",
            "status",
            "checked_in_at",
            "checked_in_by_user_id",
            "updated_at",
        ]
    )

    write_audit_log(
        actor_id=actor.id,
        action="booking.checked_in",
        target_type="booking",
        target_id=booking.id,
        metadata={
            "booked_quantity": booking.booked_quantity,
            "attended_quantity": booking.attended_quantity,
        },
    )
    return booking


def flag_booking_mismatch(*, booking, actor, note=None):
    """Implements the Cashier-only `POST /bookings/{id}/flag-mismatch/`
    (UAT round 1 -- Document 02 Sec 2.5's policy update).

    The other branch of the gate-side check-in decision, alongside
    `check_in_booking` above: when the party at the gate doesn't match
    what's booked, the Cashier has no means to fix it herself any more --
    this is the signal she sends instead, putting the booking on the
    Museum Manager's queue (`apps.bookings.services.
    list_bookings_for_staff`'s `flagged=True` filter) for the Manager to
    correct via `correct_booking_category`/`apply_booking_corrections`/
    `add_booking_item`.

    Deliberately leaves `status` (still `Pending`), and every quantity/
    category field, completely untouched -- this is a signal, not a
    correction: `note` is optional free-text context for the Manager
    (e.g. "booked 3 Students, only 2 showed"), never a source of truth
    for any number. Only ever on a `Pending` booking -- the same
    before-check-in window every correction function requires.
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("Only a Pending booking can be flagged for a mismatch.")

    booking.flagged_mismatch_at = timezone.now()
    booking.flagged_mismatch_by_user_id = actor
    booking.flagged_mismatch_note = note or None
    booking.save(
        update_fields=[
            "flagged_mismatch_at",
            "flagged_mismatch_by_user_id",
            "flagged_mismatch_note",
            "updated_at",
        ]
    )

    write_audit_log(
        actor_id=actor.id,
        action="booking.flagged_mismatch",
        target_type="booking",
        target_id=booking.id,
        metadata={"note": note} if note else {},
    )
    return booking


# --------------------------------------------------------------------------
# IFMIS voucher-prep at check-in (the settlement-rebuild build prompt's
# Step 7). Reuses `check_in_booking`'s existing return value -- neither
# function above is touched -- this is presentation logic for the
# Cashier's IFMIS data-entry screen, plus a small follow-up write once she
# reports back the real voucher reference.
# --------------------------------------------------------------------------

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
]
_SCALES = [(1_000_000_000, "Billion"), (1_000_000, "Million"), (1_000, "Thousand"), (100, "Hundred")]


def _integer_to_words(n: int) -> str:
    """Plain English long-form spelling of a non-negative integer -- no
    external dependency (`num2words` isn't in requirements/base.txt) since
    the only use is spelling out whole-Birr amounts for an IFMIS voucher,
    a bounded and simple need."""
    if n == 0:
        return "Zero"
    words = []
    remainder = n
    for value, name in _SCALES:
        if remainder >= value:
            count, remainder = divmod(remainder, value)
            words.append(f"{_integer_to_words(count)} {name}")
    if remainder:
        if remainder < 20:
            words.append(_ONES[remainder])
        else:
            tens, ones = divmod(remainder, 10)
            words.append(f"{_TENS[tens]}{'-' + _ONES[ones].lower() if ones else ''}")
    return " ".join(words)


def compute_attended_amount_etb(*, booking) -> Decimal:
    """The amount that actually belongs on the IFMIS voucher: the sum of
    each `BookingItem`'s `unit_price_etb * attended_quantity`, never the
    booking's full `total_amount_etb`.

    `total_amount_etb` is what was *booked* (and paid online up front),
    but a shortfall at the gate means some of that money is refund-
    eligible to the Visitor/group, not museum revenue -- FR-TICKET-002's
    own wording. Putting the full booked amount on the voucher for a
    partial-attendance booking would overstate the day's actual IFMIS
    revenue by however much is owed back. This mirrors
    `apps.refunds.services.compute_refundable_amount`'s per-category sum
    (kept local here rather than imported, per this module's docstring:
    `entrance` depends on `bookings` only, never on `refunds`).

    Falls back to `total_amount_etb` when per-item attendance isn't
    available yet (before check-in, or for a legacy booking checked in
    before per-item `attended_quantity` existed) -- the same "no way to
    recover per-category no-shows after the fact" situation
    `compute_refundable_amount` documents for its own legacy fallback.
    """
    items = list(booking.items.all())
    if items and all(item.attended_quantity is not None for item in items):
        total = sum(item.unit_price_etb * item.attended_quantity for item in items)
        return Decimal(total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return booking.total_amount_etb


def amount_in_words_etb(amount: Decimal) -> str:
    """The "amount in words" field a Cashier copies onto an IFMIS
    voucher -- e.g. `Decimal("1250.50")` -> `"One Thousand Two Hundred
    Fifty Birr and Fifty Cents"`. `amount` is always non-negative here
    (a `Booking.total_amount_etb`, DB-constrained positive elsewhere), so
    no sign handling is needed."""
    quantized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    birr, cents = divmod(int(quantized * 100), 100)
    words = f"{_integer_to_words(birr)} Birr"
    if cents:
        words += f" and {_integer_to_words(cents)} Cents"
    return words


def record_ifmis_voucher_reference(*, booking, actor, voucher_reference):
    """Implements `PATCH /bookings/{id}/ifmis-voucher/`. Called once the
    Cashier has actually keyed this transaction into IFMIS and gotten the
    real Document No/Ref No back -- the platform never generates or
    guesses this value itself (per the IFMIS decision: IFMIS is a closed
    system, no API calls to it).

    Restricted to the same Cashier who checked this booking in
    (`checked_in_by_user_id`) -- not any Cashier on shift today, since
    it's *her* name on that IFMIS entry, and settable only once: a
    voucher reference already recorded here is never overwritten, since
    that would let the one thing tying this booking to a specific IFMIS
    entry silently change after the fact.
    """
    if booking.checked_in_by_user_id_id != actor.id:
        raise PermissionDenied(
            "Only the cashier who checked this booking in may record its IFMIS voucher."
        )

    if booking.ifmis_voucher_reference:
        raise Conflict("An IFMIS voucher reference has already been recorded for this booking.")

    booking.ifmis_voucher_reference = voucher_reference
    booking.save(update_fields=["ifmis_voucher_reference", "updated_at"])

    write_audit_log(
        actor_id=actor.id,
        action="booking.ifmis_voucher_recorded",
        target_type="booking",
        target_id=booking.id,
        metadata={"ifmis_voucher_reference": voucher_reference},
    )
    return booking
