"""
Unit tests against entrance/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage -- see test_views.py for the
permission boundary, a view concern this module doesn't own.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.core.models import AuditLogEntry
from apps.entrance import services

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)


def _make_visitor(email="visitor@example.com"):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_cashier(email="cashier@example.com"):
    account = Account(email=email, full_name="Cashier Person", role=Account.Role.CASHIER)
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_category(price_etb="50.00"):
    return Category.objects.create(name_en="Student", name_am="Student", price_etb=Decimal(price_etb))


def _make_pending_booking(quantity=20):
    visitor = _make_visitor()
    category = _make_category()
    booking = Booking.objects.create(
        visitor=visitor,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=quantity,
        total_amount_etb=category.price_etb * quantity,
        status=Booking.Status.PENDING,
    )
    return booking


# --------------------------------------------------------------------------
# lookup_booking_by_reference (FR-TICKET-001, FR-TICKET-004)
# --------------------------------------------------------------------------


def test_lookup_finds_booking_by_reference():
    booking = _make_pending_booking()

    found = services.lookup_booking_by_reference(reference=booking.reference)

    assert found.id == booking.id


def test_lookup_is_case_insensitive_and_trims_whitespace():
    booking = _make_pending_booking()

    found = services.lookup_booking_by_reference(reference=f"  {booking.reference.lower()}  ")

    assert found.id == booking.id


def test_lookup_missing_reference_is_a_validation_error():
    with pytest.raises(ValidationError):
        services.lookup_booking_by_reference(reference="")


def test_lookup_unknown_reference_is_not_found():
    with pytest.raises(NotFound):
        services.lookup_booking_by_reference(reference="ZZZZZZZZ")


# --------------------------------------------------------------------------
# check_in_booking (FR-TICKET-001 - FR-TICKET-003, FR-TICKET-005)
# --------------------------------------------------------------------------


def test_check_in_full_attendance_marks_visited():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    booking = services.check_in_booking(booking=booking, attended_quantity=20, actor=cashier)

    assert booking.status == Booking.Status.VISITED
    assert booking.attended_quantity == 20
    assert booking.checked_in_by_user_id_id == cashier.id
    assert booking.checked_in_at is not None
    entry = AuditLogEntry.objects.get(action="booking.checked_in")
    assert entry.metadata["refund_eligible"] is False


def test_check_in_partial_attendance_flags_refund_eligible_but_does_not_refund():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    booking = services.check_in_booking(booking=booking, attended_quantity=15, actor=cashier)

    assert booking.status == Booking.Status.VISITED
    assert booking.attended_quantity == 15
    entry = AuditLogEntry.objects.get(action="booking.checked_in")
    assert entry.metadata["refund_eligible"] is True


def test_check_in_zero_attendance_is_allowed():
    booking = _make_pending_booking(quantity=5)
    cashier = _make_cashier()

    booking = services.check_in_booking(booking=booking, attended_quantity=0, actor=cashier)

    assert booking.status == Booking.Status.VISITED
    assert booking.attended_quantity == 0


def test_check_in_rejects_attendance_exceeding_booked_quantity():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.check_in_booking(booking=booking, attended_quantity=21, actor=cashier)

    booking.refresh_from_db()
    assert booking.status == Booking.Status.PENDING
    assert booking.attended_quantity is None


def test_check_in_rejects_negative_attendance():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.check_in_booking(booking=booking, attended_quantity=-1, actor=cashier)


@pytest.mark.parametrize(
    "status",
    [
        Booking.Status.AWAITING_PAYMENT,
        Booking.Status.PENDING_APPROVAL,
        Booking.Status.VISITED,
        Booking.Status.CANCELLED,
        Booking.Status.REFUNDED,
    ],
)
def test_check_in_rejects_non_pending_booking(status):
    booking = _make_pending_booking(quantity=20)
    booking.status = status
    booking.save(update_fields=["status"])
    cashier = _make_cashier()

    with pytest.raises(Conflict):
        services.check_in_booking(booking=booking, attended_quantity=20, actor=cashier)


def test_check_in_already_visited_booking_cannot_be_checked_in_again():
    """FR-TICKET-003: once checked in, it's no longer Pending -- a second
    check-in attempt (e.g. a duplicate scan) must not silently overwrite
    the first attendance count."""
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()
    services.check_in_booking(booking=booking, attended_quantity=15, actor=cashier)

    with pytest.raises(Conflict):
        services.check_in_booking(booking=booking, attended_quantity=20, actor=cashier)
