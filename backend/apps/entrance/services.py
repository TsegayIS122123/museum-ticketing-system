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

from django.conf import settings
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
# IFMIS voucher-prep at check-in (originally the settlement-rebuild build
# prompt's Step 7; the voucher shape and amount-in-words format below were
# both corrected in UAT round 1 Phase 6 against a real sample voucher --
# see `compute_voucher`'s own docstring). Reuses `check_in_booking`'s
# existing return value -- neither function above is touched -- this is
# presentation logic for the Cashier's IFMIS data-entry screen, plus a
# small follow-up write once she reports the real Document No/Ref No
# back.
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
    """The "amount in words" (የገንዘቡ ልክ በፊደል) field a Cashier copies
    onto an IFMIS voucher -- format fixed to match IFMIS's own output
    exactly (Phase 6, UAT round 1, matched against a real sample
    voucher): `"{words} ETB And {cents_words} Cents"`, e.g.
    `Decimal("1250.50")` -> `"One Thousand Two Hundred Fifty ETB And
    Fifty Cents"`, and, critically, `Decimal("1000.00")` -> `"One
    Thousand ETB And Zero Cents"` -- the cents clause is ALWAYS present,
    even at zero, unlike this function's pre-Phase-6 shape (which used
    "Birr" instead of "ETB" and omitted the cents clause entirely when
    zero). `amount` is always non-negative here (a `Booking.
    total_amount_etb`, DB-constrained positive elsewhere), so no sign
    handling is needed.
    """
    quantized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    birr, cents = divmod(int(quantized * 100), 100)
    return f"{_integer_to_words(birr)} ETB And {_integer_to_words(cents)} Cents"


def _resolve_received_from(booking) -> str:
    """"Received From" / ደረሰኝ ከ -- matches the sample voucher's
    single-line `"{name} Tin {tin}"` shape exactly (`BS School Group Tin
    0000900158`, name and TIN run together, no comma, no colon).

    Institution-aware (Phase 6, now that `apps.institutions` exists,
    Phase 5): prefers `booking.institution`'s own canonical name/TIN over
    the booking's own `group_name`/`group_tin` snapshot, since the
    institution record is what stays correct if a later booking corrects
    a spelling (`apps.institutions.services.resolve_institution`) -- but
    falls back to the booking's own snapshot for a legacy group booking
    that predates this app and was never backfilled (`Booking.
    institution`'s own field comment), so a booking without a linked
    institution still gets a usable voucher. Falls back further, to the
    individual Visitor's own name, for a non-group booking, which has
    neither.
    """
    if booking.institution_id:
        return f"{booking.institution.name} Tin {booking.institution.tin}"
    if booking.booking_type == booking.BookingType.GROUP:
        return f"{booking.group_name} Tin {booking.group_tin}"
    return booking.visitor.full_name


def _compute_purpose(booking) -> str:
    """"Purpose" -- the sample voucher has no line-item table at all;
    category counts are prose inside this one field instead (Phase 6's
    sample-voucher correction to an earlier, table-based assumption).
    `To visit 20 student` for one category, `To visit 3 student, 1
    adult` for a mix -- deliberately plain (no pluralization, no
    alphabetical/price sorting) rather than over-engineered, per this
    phase's own instruction; ordering is simply each `BookingItem`'s
    creation order.

    Uses `attended_quantity` -- what actually needs paying for, matching
    `compute_attended_amount_etb` -- falling back to `quantity` for an
    item checked in before per-item attendance existed (same legacy
    fallback that function documents). A category with zero attendance
    doesn't appear in the sentence at all: nobody from it is entering.
    """
    parts = []
    for item in booking.items.order_by("created_at"):
        quantity = item.attended_quantity if item.attended_quantity is not None else item.quantity
        if not quantity:
            continue
        parts.append(f"{quantity} {item.category_name_en.lower()}")
    if not parts:
        return "To visit the museum"
    return "To visit " + ", ".join(parts)


def compute_voucher(*, booking) -> dict:
    """Builds the single `voucher` object returned by both `POST
    /bookings/{id}/check-in` (via `CheckInResponseSerializer`) and `GET
    /bookings/{id}/ifmis-voucher/` (so the panel can be re-opened later,
    Phase 6 Step 6) -- one function, computed here and nowhere else
    (never in the frontend), so the two callers can never drift apart.

    Fields match the real sample voucher's own layout, top to bottom
    (Phase 6's table): `documentNo`/`refNo` are whatever's been recorded
    so far via `record_ifmis_voucher` (both `None` until she reports
    them back -- IFMIS is a closed system this platform never calls, so
    neither can be known any earlier than that). `date` is the
    Gregorian check-in date, formatted to match the sample
    (`13-AUG-2026`); the Ethiopian-calendar ቀን field on the paper is
    printed by IFMIS itself and isn't reproduced here at all (it's for
    cross-checking against the paper, not a value we generate).
    `nameOfPublicBody` is a fixed constant (`settings.
    IFMIS_PUBLIC_BODY_NAME`), never derived from this platform's own
    museum branding -- see that setting's own comment for why.
    `voucherRecorded` is `True` only once *both* identifiers are present
    (Section 8's default: both required together) -- the frontend's
    "voucher pending" badge is driven by this flag, not by checking
    either field individually.
    """
    checked_in_at = timezone.localtime(booking.checked_in_at) if booking.checked_in_at else None
    amount = compute_attended_amount_etb(booking=booking)
    return {
        "documentNo": booking.ifmis_document_no,
        "date": checked_in_at.strftime("%d-%b-%Y").upper() if checked_in_at else None,
        "refNo": booking.ifmis_voucher_reference,
        "nameOfPublicBody": settings.IFMIS_PUBLIC_BODY_NAME,
        "receivedFrom": _resolve_received_from(booking),
        "amountFigures": f"ETB {amount:,.2f}",
        "amountWords": amount_in_words_etb(amount),
        "purpose": _compute_purpose(booking),
        "voucherRecorded": bool(booking.ifmis_document_no and booking.ifmis_voucher_reference),
    }


def record_ifmis_voucher(*, booking, actor, document_no, ref_no):
    """Implements `PATCH /bookings/{id}/ifmis-voucher/`. Called once the
    Cashier has actually keyed this transaction into IFMIS and gotten the
    real Document No *and* Ref No back -- the platform never generates or
    guesses either value itself (per the IFMIS decision: IFMIS is a
    closed system, no API calls to it).

    Section 8's default: both identifiers are required together, in one
    call -- IFMIS issues them as a pair at the moment it accepts the
    transaction, so there's no real intermediate state where a Cashier
    legitimately has one but not the other to report back yet.

    Restricted to the same Cashier who checked this booking in
    (`checked_in_by_user_id`) -- not any Cashier on shift today, since
    it's *her* name on that IFMIS entry, and settable only once: a
    voucher already recorded here is never overwritten (either field),
    since that would let the one thing tying this booking to a specific
    IFMIS entry silently change after the fact.
    """
    if booking.checked_in_by_user_id_id != actor.id:
        raise PermissionDenied(
            "Only the cashier who checked this booking in may record its IFMIS voucher."
        )

    if booking.ifmis_document_no or booking.ifmis_voucher_reference:
        raise Conflict("An IFMIS voucher has already been recorded for this booking.")

    booking.ifmis_document_no = document_no
    booking.ifmis_voucher_reference = ref_no
    booking.save(update_fields=["ifmis_document_no", "ifmis_voucher_reference", "updated_at"])

    write_audit_log(
        actor_id=actor.id,
        action="booking.ifmis_voucher_recorded",
        target_type="booking",
        target_id=booking.id,
        metadata={"ifmis_document_no": document_no, "ifmis_voucher_reference": ref_no},
    )
    return booking
