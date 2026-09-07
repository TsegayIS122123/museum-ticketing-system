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
apps.entrance") but never writes to `refunds`/`settlement` state itself --
FR-TICKET-002's "refund-eligible" outcome is communicated back to the
caller as data (see `check_in_booking`'s return / the shortfall flagged in
the audit metadata), and it is `apps.refunds`' job (once it exists) to act
on a Visitor's subsequent refund request against a `Visited` booking with
`attended_quantity < booked_quantity`. This module never calls into
`apps.refunds` or `apps.payments` directly (Sec 3.2's dependency
direction) -- payment is out of scope here entirely.

Authorization (Cashier-only) is the view layer's job (permission classes),
mirroring `bookings/services.py`'s own division of labor -- this module
assumes the caller has already been authorized. What this module *does*
check is booking state (only a `Pending` booking is checkable-in) and the
headcount invariant (FR-TICKET-005).
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
def check_in_booking(*, booking, attended_items, actor):
    """Implements `POST /bookings/{id}/check-in`.

    `attended_items` is a list of `{"item_id": <BookingItem.id>,
    "attended_quantity": <int>}` -- one entry per `BookingItem` on this
    booking, per category. This is per-category, not a single blended
    headcount, precisely *because* `apps.refunds.services.
    compute_refundable_amount` needs to know which category a
    subsequent shortfall belonged to (FR-REFUND-002): recording only one
    combined total (the old shape) throws that information away at the
    moment it's actually available -- the Cashier, standing at the gate,
    knows exactly which ticket-holders didn't show up.

    - FR-TICKET-001: records the actual number of visitors who showed up,
      per category.
    - FR-TICKET-002: the booking becomes `Visited`; if the booking-level
      total is less than `booked_quantity` the shortfall is flagged as
      refund-eligible in the response, but is never auto-refunded here --
      that requires the Visitor/group leader to ask (`apps.refunds`).
    - FR-TICKET-003: only a `Pending` booking is checkable-in -- once this
      succeeds the booking is no longer `Pending` and the Visitor can no
      longer cancel/reschedule it themselves (enforced independently by
      `bookings.services._require_own_pending_booking`).
    - FR-TICKET-005: no item's attended quantity may exceed that item's
      own booked quantity -- the excess is rejected outright, not clamped
      or partially admitted. Also enforced at the DB level by
      `BookingItem`'s `booking_item_attended_within_quantity`
      CheckConstraint (and, for the booking-level total,  `Booking`'s own
      `booking_attended_within_booked`), so this is belt-and-braces, not
      the only guard.

    `Booking.attended_quantity` is still written, as the denormalized sum
    across every item -- every existing consumer that only ever needed
    the booking-level total (headcount displays, the "is this booking
    checked in" flag, `apps.refunds`' no-shortfall-eligible check) keeps
    working unchanged; it's simply derived from the per-item counts now
    instead of being the only number captured.
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("This booking is not in a checkable-in state.")

    items_by_id = {str(item.id): item for item in booking.items.all()}

    provided_ids = [str(entry["item_id"]) for entry in attended_items]
    if set(provided_ids) != set(items_by_id.keys()) or len(provided_ids) != len(
        set(provided_ids)
    ):
        # Every category on this booking must be accounted for exactly
        # once -- a missing item would silently leave its
        # `attended_quantity` NULL (indistinguishable from "not checked
        # in yet"), and a duplicate/unknown item id is simply malformed
        # input. This is a 400, not a 409: the request itself is
        # malformed, not merely conflicting with current state.
        raise ValidationError(
            {"items": "Must include exactly one entry for each of this booking's items."}
        )

    for entry in attended_items:
        item = items_by_id[str(entry["item_id"])]
        attended = entry["attended_quantity"]
        if attended < 0:
            raise ValidationError({"items": "attendedQuantity must not be negative."})
        if attended > item.quantity:
            # FR-TICKET-005: extra visitors are not admitted under this
            # category -- they must book/pay separately, exactly as any
            # other new visitor would.
            raise ValidationError(
                {
                    "items": (
                        f"attendedQuantity for {item.category_name_en} exceeds the "
                        "quantity booked for that category. Excess visitors must "
                        "book separately, online or at the manual counter."
                    )
                }
            )

    total_attended = 0
    for entry in attended_items:
        item = items_by_id[str(entry["item_id"])]
        item.attended_quantity = entry["attended_quantity"]
        total_attended += entry["attended_quantity"]
    BookingItem.objects.bulk_update(items_by_id.values(), ["attended_quantity"])

    booking.attended_quantity = total_attended
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

    shortfall = booking.booked_quantity - total_attended
    write_audit_log(
        actor_id=actor.id,
        action="booking.checked_in",
        target_type="booking",
        target_id=booking.id,
        metadata={
            "booked_quantity": booking.booked_quantity,
            "attended_quantity": total_attended,
            "attended_items": {
                str(entry["item_id"]): entry["attended_quantity"] for entry in attended_items
            },
            "refund_eligible": shortfall > 0,
        },
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
