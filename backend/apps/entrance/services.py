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

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.bookings.models import Booking
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
        return Booking.objects.get(reference=reference)
    except Booking.DoesNotExist:
        raise NotFound("No booking found for that reference.")


# --------------------------------------------------------------------------
# Check-in / headcount reconciliation (FR-TICKET-001 - FR-TICKET-003, 005)
# --------------------------------------------------------------------------


@transaction.atomic
def check_in_booking(*, booking, attended_quantity, actor):
    """Implements `POST /bookings/{id}/check-in`.

    - FR-TICKET-001: records the actual number of visitors who showed up.
    - FR-TICKET-002: the booking becomes `Visited`; if `attended_quantity`
      is less than `booked_quantity` the shortfall is flagged as
      refund-eligible in the response, but is never auto-refunded here --
      that requires the Visitor/group leader to ask (`apps.refunds`).
    - FR-TICKET-003: only a `Pending` booking is checkable-in -- once this
      succeeds the booking is no longer `Pending` and the Visitor can no
      longer cancel/reschedule it themselves (enforced independently by
      `bookings.services._require_own_pending_booking`).
    - FR-TICKET-005: `attended_quantity` may not exceed `booked_quantity`
      -- the excess is rejected outright, not clamped or partially
      admitted. Also enforced at the DB level by `Booking`'s
      `booking_attended_within_booked` CheckConstraint, so this is
      belt-and-braces, not the only guard.
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("This booking is not in a checkable-in state.")

    if attended_quantity < 0:
        raise ValidationError({"attendedQuantity": "Must not be negative."})

    if attended_quantity > booking.booked_quantity:
        # FR-TICKET-005: extra visitors are not admitted under this
        # booking -- they must book/pay separately, exactly as any other
        # new visitor would. This is a 400, not a 409: the request itself
        # is invalid, not merely conflicting with current state.
        raise ValidationError(
            {
                "attendedQuantity": (
                    "Exceeds the booked quantity. Excess visitors must book "
                    "separately, online or at the manual counter."
                )
            }
        )

    booking.attended_quantity = attended_quantity
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

    shortfall = booking.booked_quantity - attended_quantity
    write_audit_log(
        actor_id=actor.id,
        action="booking.checked_in",
        target_type="booking",
        target_id=booking.id,
        metadata={
            "booked_quantity": booking.booked_quantity,
            "attended_quantity": attended_quantity,
            "refund_eligible": shortfall > 0,
        },
    )
    return booking
