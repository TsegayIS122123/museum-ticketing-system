"""
bookings -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Authorization (Museum-Manager-only for approval decisions and date
closure, Visitor-only for creation/cancel/reschedule) is the view layer's
job (permission classes), not this module's -- services assume the caller
has already been authorized, mirroring accounts/services.py and
catalog/services.py's own division of labor. What this module *does*
check is ownership (a Visitor can only cancel/reschedule their own
booking) and state (only a `Pending` booking can be cancelled/rescheduled)
-- those are business rules, not authorization.

Payment-gateway integration (Chapa checkout session creation) is
deliberately absent here: per Design Spec Sec 3.2, `payments` depends on
`bookings`, not the reverse. A booking this app creates is left in
`awaiting_payment` (individual) or `pending_approval` (group) with
`chapa_checkout_url` unset; `apps.payments` is what populates it once
that app exists (Sec 4.2's sequence). Likewise, cancellation/no-response
here only transitions `status` and writes an audit-log entry -- the
actual refund call (FR-REFUND-001a/c) is `apps.refunds`' job, which
depends on `bookings`, not the reverse.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.core.services import write_audit_log

from .models import Booking, DateAvailability

# Document 02 Sec 5 / Document 07: a sensible ceiling on a single
# GET /availability query so a caller can't force an unbounded scan --
# generous enough for the "yearly" reporting granularity in FR-REPORT-002.
MAX_AVAILABILITY_RANGE_DAYS = 366


# --------------------------------------------------------------------------
# Date availability (FR-BOOK-008)
# --------------------------------------------------------------------------


def is_date_open_for_booking(visit_date) -> bool:
    """A date with no row is open by default -- "the system does not
    calculate or track overall museum capacity itself" (FR-BOOK-008); a
    row only exists once the Museum Manager has explicitly acted on it."""
    row = DateAvailability.objects.filter(visit_date=visit_date).first()
    return row is None or row.is_open_for_booking


def list_date_availability(*, date_from, date_to):
    """Implements `GET /availability` (FR-BOOK-008). Returns one entry per
    calendar date in the inclusive range, materializing the "open by
    default" rule for dates that have no row rather than only returning
    dates the Museum Manager has explicitly touched."""
    if date_from > date_to:
        raise ValidationError({"to": "Must not be before 'from'."})
    if (date_to - date_from).days + 1 > MAX_AVAILABILITY_RANGE_DAYS:
        raise ValidationError(
            {"to": f"Range must not exceed {MAX_AVAILABILITY_RANGE_DAYS} days."}
        )

    existing = {
        row.visit_date: row
        for row in DateAvailability.objects.filter(
            visit_date__gte=date_from, visit_date__lte=date_to
        )
    }

    results = []
    current = date_from
    while current <= date_to:
        row = existing.get(current)
        if row is not None:
            results.append(row)
        else:
            # Materialized default -- open, never explicitly touched.
            results.append(DateAvailability(visit_date=current, is_open_for_booking=True))
        current += timedelta(days=1)
    return results


def set_date_availability(*, visit_date, is_open_for_booking, actor):
    """Implements the Museum-Manager-only `PUT /availability/{date}`
    (FR-BOOK-008). "Closing a date does not affect bookings already made
    for it" -- this function never touches an existing `Booking` row."""
    now = timezone.now()
    row, _created = DateAvailability.objects.get_or_create(visit_date=visit_date)
    row.is_open_for_booking = is_open_for_booking
    row.closed_by_user_id = actor
    row.closed_at = now
    row.save()

    write_audit_log(
        actor_id=actor.id,
        action="date_availability.changed",
        target_type="date_availability",
        target_id=visit_date.isoformat(),
        metadata={"is_open_for_booking": is_open_for_booking},
    )
    return row


# --------------------------------------------------------------------------
# Booking creation (FR-BOOK-001, FR-BOOK-003)
# --------------------------------------------------------------------------


@transaction.atomic
def create_booking(
    *,
    visitor,
    category_id,
    visit_date,
    quantity,
    booking_type,
    group_name=None,
    group_contact_phone=None,
):
    """Implements FR-BOOK-001 (individual) and FR-BOOK-003 (group).

    An individual booking starts `awaiting_payment`, ready for
    `apps.payments` to create a Chapa checkout session against it. A
    group booking starts `pending_approval` instead -- FR-BOOK-003: the
    Museum Manager decides before any payment is initiated.
    """
    if not visitor.email_verified_at or not visitor.phone_verified_at:
        # FR-ACC-003: both must be verified before an online booking can
        # proceed -- there is no separate account-creation step besides
        # completing FR-ACC-001's OTP-and-email-link verification.
        raise ValidationError(
            "Both your email and phone must be verified before you can book online."
        )

    if quantity < 1:
        raise ValidationError({"quantity": "Must be at least 1."})

    if booking_type == Booking.BookingType.GROUP and not group_name:
        raise ValidationError({"groupName": "Required for a group booking."})

    try:
        category = Category.objects.get(id=category_id, active=True)
    except Category.DoesNotExist:
        raise ValidationError({"categoryId": "Not a known, active category."})

    if not is_date_open_for_booking(visit_date):
        raise Conflict("This date is closed to online booking.")

    is_group = booking_type == Booking.BookingType.GROUP
    booking = Booking.objects.create(
        visitor=visitor,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        visit_date=visit_date,
        booking_type=booking_type,
        group_name=group_name if is_group else None,
        group_contact_phone=group_contact_phone,
        booked_quantity=quantity,
        total_amount_etb=category.price_etb * quantity,
        status=Booking.Status.PENDING_APPROVAL if is_group else Booking.Status.AWAITING_PAYMENT,
        approval_status=Booking.ApprovalStatus.PENDING if is_group else None,
    )

    write_audit_log(
        actor_id=visitor.id,
        action="booking.created",
        target_type="booking",
        target_id=booking.id,
        metadata={"booking_type": booking_type, "visit_date": visit_date.isoformat()},
    )
    return booking


# --------------------------------------------------------------------------
# Group approval (FR-BOOK-003)
# --------------------------------------------------------------------------


def decide_group_booking(*, booking, decision, actor, note=None):
    """Implements the Museum-Manager-only `PUT /bookings/{id}/approval`.
    Approving moves the booking to `awaiting_payment` so the group leader
    can pay (`apps.payments` picks it up from there, Document 04's "if
    approved, the response includes a checkout URL"); declining is
    terminal -- there is no `declined` value in `Booking.Status`
    (Document 05 Sec 3.3), so a declined booking is simply `cancelled`,
    with `approvalStatus=declined` carrying the distinction."""
    if (
        booking.booking_type != Booking.BookingType.GROUP
        or booking.status != Booking.Status.PENDING_APPROVAL
    ):
        raise Conflict("This booking is not awaiting a group-approval decision.")

    if decision == "approve":
        booking.approval_status = Booking.ApprovalStatus.APPROVED
        booking.status = Booking.Status.AWAITING_PAYMENT
    elif decision == "decline":
        booking.approval_status = Booking.ApprovalStatus.DECLINED
        booking.status = Booking.Status.CANCELLED
    else:
        raise ValidationError({"decision": "Must be 'approve' or 'decline'."})

    booking.approved_by_user_id = actor
    booking.approved_at = timezone.now()
    booking.save()

    write_audit_log(
        actor_id=actor.id,
        action="booking.approval_decided",
        target_type="booking",
        target_id=booking.id,
        metadata={"decision": decision, "note": note},
    )
    return booking


# --------------------------------------------------------------------------
# Cancel / reschedule (FR-BOOK-005 - FR-BOOK-007)
# --------------------------------------------------------------------------


def _require_own_pending_booking(*, booking, visitor):
    if booking.visitor_id != visitor.id:
        # Deliberately 403, not 404 -- the booking exists, this Visitor
        # just doesn't own it (mirrors accounts' identical-error
        # discipline for auth, applied here to ownership instead).
        raise PermissionDenied("This booking does not belong to you.")
    if booking.status != Booking.Status.PENDING:
        # FR-BOOK-005/FR-TICKET-003: once the Cashier has begun
        # processing arrival (status is no longer Pending), the Visitor
        # can no longer cancel or reschedule it themselves.
        raise Conflict("This booking is no longer Pending and can't be changed by you.")


def cancel_booking(*, booking, visitor):
    """Implements FR-BOOK-005/006. Only transitions status here -- the
    "full, automatic refund" itself (FR-BOOK-006) is `apps.refunds`'
    responsibility, triggered off this status change, not called
    directly from this module (Sec 3.2: `refunds` depends on `bookings`,
    not the reverse)."""
    _require_own_pending_booking(booking=booking, visitor=visitor)

    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status", "updated_at"])

    write_audit_log(
        actor_id=visitor.id,
        action="booking.cancelled",
        target_type="booking",
        target_id=booking.id,
        metadata={},
    )
    return booking


def reschedule_booking(*, booking, visitor, new_visit_date):
    """Implements FR-BOOK-007: same eligibility window as cancellation,
    at most one reschedule ever (also enforced at the DB level by
    `Booking`'s `rescheduled_count <= 1` CheckConstraint)."""
    _require_own_pending_booking(booking=booking, visitor=visitor)

    if booking.rescheduled_count >= 1:
        raise Conflict("This booking has already been rescheduled once.")

    if not is_date_open_for_booking(new_visit_date):
        raise Conflict("This date is closed to online booking.")

    booking.visit_date = new_visit_date
    booking.rescheduled_count += 1
    booking.save(update_fields=["visit_date", "rescheduled_count", "updated_at"])

    write_audit_log(
        actor_id=visitor.id,
        action="booking.rescheduled",
        target_type="booking",
        target_id=booking.id,
        metadata={"new_visit_date": new_visit_date.isoformat()},
    )
    return booking


# --------------------------------------------------------------------------
# Listing (FR-ACC-004, staff filtering)
# --------------------------------------------------------------------------


def list_my_bookings(*, visitor, status=None):
    """Implements `GET /users/me/bookings` (FR-ACC-004) -- a Visitor's own
    booking history, whether they've booked once or many times."""
    queryset = Booking.objects.select_related("visitor").filter(visitor=visitor)
    if status:
        queryset = queryset.filter(status=status)
    return queryset


def list_bookings_for_staff(*, status=None, visit_date=None, booking_type=None):
    """Implements `GET /bookings` (Staff only). Visitors use
    `list_my_bookings` above -- this has no ownership scoping at all,
    matching the single-venue, flat-role authorization model (Sec 4.3)."""
    # select_related("visitor") -- BookingSerializer reads
    # visitor.full_name/email/phone for every row in this list.
    queryset = Booking.objects.select_related("visitor")
    if status:
        queryset = queryset.filter(status=status)
    if visit_date:
        queryset = queryset.filter(visit_date=visit_date)
    if booking_type:
        queryset = queryset.filter(booking_type=booking_type)
    return queryset
