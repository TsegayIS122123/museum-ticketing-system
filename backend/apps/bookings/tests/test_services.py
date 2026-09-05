"""
Unit tests against bookings/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage -- see test_views.py for the
permission/ownership boundary, a view concern this module doesn't own.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import Account
from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.core.models import AuditLogEntry
from apps.bookings import services
from apps.bookings.models import Booking, DateAvailability

pytestmark = pytest.mark.django_db


def _make_visitor(email="visitor@example.com", verified=True):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    if verified:
        account.email_verified_at = timezone.now()
        account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_manager(email="manager@example.com"):
    account = Account(email=email, full_name="Manager Person", role=Account.Role.MUSEUM_MANAGER)
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_category(name_en="Student", price_etb="50.00", active=True):
    return Category.objects.create(
        name_en=name_en, name_am=name_en, price_etb=Decimal(price_etb), active=active
    )


TOMORROW = date.today() + timedelta(days=1)


# --------------------------------------------------------------------------
# is_date_open_for_booking / list_date_availability (FR-BOOK-008)
# --------------------------------------------------------------------------


def test_date_with_no_row_is_open_by_default():
    assert services.is_date_open_for_booking(TOMORROW) is True


def test_list_date_availability_materializes_defaults_for_untouched_dates():
    results = services.list_date_availability(date_from=TOMORROW, date_to=TOMORROW + timedelta(days=2))

    assert [r.visit_date for r in results] == [
        TOMORROW,
        TOMORROW + timedelta(days=1),
        TOMORROW + timedelta(days=2),
    ]
    assert all(r.is_open_for_booking for r in results)


def test_list_date_availability_reflects_explicit_closure():
    DateAvailability.objects.create(visit_date=TOMORROW, is_open_for_booking=False)

    [result] = services.list_date_availability(date_from=TOMORROW, date_to=TOMORROW)

    assert result.is_open_for_booking is False


def test_list_date_availability_rejects_backwards_range():
    with pytest.raises(ValidationError):
        services.list_date_availability(date_from=TOMORROW, date_to=TOMORROW - timedelta(days=1))


def test_list_date_availability_rejects_oversized_range():
    with pytest.raises(ValidationError):
        services.list_date_availability(
            date_from=TOMORROW, date_to=TOMORROW + timedelta(days=400)
        )


def test_set_date_availability_closes_a_date_and_audit_logs():
    manager = _make_manager()

    row = services.set_date_availability(
        visit_date=TOMORROW, is_open_for_booking=False, actor=manager
    )

    assert row.is_open_for_booking is False
    assert row.closed_by_user_id_id == manager.id
    assert services.is_date_open_for_booking(TOMORROW) is False
    assert AuditLogEntry.objects.filter(action="date_availability.changed").exists()


def test_set_date_availability_never_touches_existing_bookings():
    """"Closing a date does not affect bookings already made for it" (FR-BOOK-008)."""
    manager = _make_manager()
    visitor = _make_visitor()
    category = _make_category()
    booking = services.create_booking(
        visitor=visitor,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=1,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    services.set_date_availability(visit_date=TOMORROW, is_open_for_booking=False, actor=manager)
    booking.refresh_from_db()

    assert booking.status == Booking.Status.AWAITING_PAYMENT


# --------------------------------------------------------------------------
# create_booking (FR-BOOK-001, FR-BOOK-003)
# --------------------------------------------------------------------------


def test_create_individual_booking_starts_awaiting_payment():
    visitor = _make_visitor()
    category = _make_category(price_etb="50.00")

    booking = services.create_booking(
        visitor=visitor,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=2,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.total_amount_etb == Decimal("100.00")
    assert booking.category_name_en == category.name_en
    assert len(booking.reference) == 8
    assert AuditLogEntry.objects.filter(action="booking.created").exists()


def test_create_group_booking_starts_awaiting_payment():
    """A group booking (FR-BOOK-003) has no Museum-Manager approval gate
    -- DateAvailability (FR-BOOK-008) is the only capacity control, and it
    applies identically to individual and group bookings alike."""
    visitor = _make_visitor()
    category = _make_category()

    booking = services.create_booking(
        visitor=visitor,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=30,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example Primary School",
    )

    assert booking.status == Booking.Status.AWAITING_PAYMENT


def test_create_group_booking_requires_group_name():
    visitor = _make_visitor()
    category = _make_category()

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            category_id=category.id,
            visit_date=TOMORROW,
            quantity=30,
            booking_type=Booking.BookingType.GROUP,
        )


def test_create_booking_rejected_for_unverified_visitor():
    visitor = _make_visitor(verified=False)
    category = _make_category()

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            category_id=category.id,
            visit_date=TOMORROW,
            quantity=1,
            booking_type=Booking.BookingType.INDIVIDUAL,
        )


def test_create_booking_rejected_for_inactive_category():
    visitor = _make_visitor()
    category = _make_category(active=False)

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            category_id=category.id,
            visit_date=TOMORROW,
            quantity=1,
            booking_type=Booking.BookingType.INDIVIDUAL,
        )


def test_create_booking_rejected_for_closed_date():
    visitor = _make_visitor()
    category = _make_category()
    manager = _make_manager()
    services.set_date_availability(visit_date=TOMORROW, is_open_for_booking=False, actor=manager)

    with pytest.raises(Conflict):
        services.create_booking(
            visitor=visitor,
            category_id=category.id,
            visit_date=TOMORROW,
            quantity=1,
            booking_type=Booking.BookingType.INDIVIDUAL,
        )


# --------------------------------------------------------------------------
# correct_booking_category (ID-verification addendum to Document 02 Sec 2.2)
# --------------------------------------------------------------------------


def _make_cashier(email="cashier@example.com"):
    account = Account(email=email, full_name="Cashier Person", role=Account.Role.CASHIER)
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_correctable_booking(category, quantity=1):
    visitor = _make_visitor()
    booking = services.create_booking(
        visitor=visitor,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=quantity,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    # Skip apps.payments entirely -- these tests only exercise
    # bookings/services.py, which never imports it (Design Spec Sec 3.2).
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status", "updated_at"])
    return booking


def test_correct_category_to_a_pricier_one_reopens_payment_for_the_difference():
    student = _make_category(name_en="Student", price_etb="50.00")
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    booking = _make_correctable_booking(student)
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, category_id=non_resident.id, actor=cashier
    )

    assert delta == Decimal("450.00")
    assert booking.category_id == non_resident.id
    assert booking.unit_price_etb == Decimal("500.00")
    assert booking.total_amount_etb == Decimal("500.00")
    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.category_corrected_by_user_id_id == cashier.id
    assert booking.category_corrected_at is not None


def test_correct_category_to_a_cheaper_one_leaves_booking_pending():
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(non_resident)
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, category_id=student.id, actor=cashier
    )

    assert delta == Decimal("-450.00")
    assert booking.total_amount_etb == Decimal("50.00")
    # Overcharge doesn't block check-in -- only an undercharge does.
    assert booking.status == Booking.Status.PENDING


def test_correct_category_scales_with_booked_quantity():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult / Teacher", price_etb="100.00")
    booking = _make_correctable_booking(student, quantity=30)
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, category_id=adult.id, actor=cashier
    )

    assert delta == Decimal("1500.00")
    assert booking.total_amount_etb == Decimal("3000.00")


def test_correct_category_rejected_once_no_longer_pending():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult / Teacher", price_etb="100.00")
    booking = _make_correctable_booking(student)
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status", "updated_at"])
    cashier = _make_cashier()

    with pytest.raises(Conflict):
        services.correct_booking_category(booking=booking, category_id=adult.id, actor=cashier)


def test_correct_category_rejects_the_same_category():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(booking=booking, category_id=student.id, actor=cashier)


def test_correct_category_rejects_an_inactive_category():
    student = _make_category(name_en="Student", price_etb="50.00")
    retired = _make_category(name_en="Retired Category", price_etb="10.00", active=False)
    booking = _make_correctable_booking(student)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(booking=booking, category_id=retired.id, actor=cashier)


# --------------------------------------------------------------------------
# cancel_booking (FR-BOOK-005/006)
# --------------------------------------------------------------------------


def _make_pending_booking(visitor=None):
    visitor = visitor or _make_visitor()
    category = _make_category()
    booking = services.create_booking(
        visitor=visitor,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=1,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])
    return booking, visitor


def test_cancel_pending_booking_succeeds():
    booking, visitor = _make_pending_booking()

    booking = services.cancel_booking(booking=booking, visitor=visitor)

    assert booking.status == Booking.Status.CANCELLED
    assert AuditLogEntry.objects.filter(action="booking.cancelled").exists()


def test_cancel_rejected_once_no_longer_pending():
    booking, visitor = _make_pending_booking()
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status"])

    with pytest.raises(Conflict):
        services.cancel_booking(booking=booking, visitor=visitor)


def test_cancel_rejected_for_a_different_visitor():
    booking, _owner = _make_pending_booking()
    someone_else = _make_visitor(email="someone-else@example.com")

    with pytest.raises(PermissionDenied):
        services.cancel_booking(booking=booking, visitor=someone_else)


# --------------------------------------------------------------------------
# reschedule_booking (FR-BOOK-007)
# --------------------------------------------------------------------------


def test_reschedule_pending_booking_succeeds():
    booking, visitor = _make_pending_booking()
    new_date = TOMORROW + timedelta(days=5)

    booking = services.reschedule_booking(booking=booking, visitor=visitor, new_visit_date=new_date)

    assert booking.visit_date == new_date
    assert booking.rescheduled_count == 1
    assert AuditLogEntry.objects.filter(action="booking.rescheduled").exists()


def test_reschedule_rejected_after_first_reschedule():
    booking, visitor = _make_pending_booking()
    services.reschedule_booking(
        booking=booking, visitor=visitor, new_visit_date=TOMORROW + timedelta(days=5)
    )

    with pytest.raises(Conflict):
        services.reschedule_booking(
            booking=booking, visitor=visitor, new_visit_date=TOMORROW + timedelta(days=6)
        )


def test_reschedule_rejected_onto_a_closed_date():
    booking, visitor = _make_pending_booking()
    manager = _make_manager()
    closed_date = TOMORROW + timedelta(days=5)
    services.set_date_availability(visit_date=closed_date, is_open_for_booking=False, actor=manager)

    with pytest.raises(Conflict):
        services.reschedule_booking(booking=booking, visitor=visitor, new_visit_date=closed_date)


def test_reschedule_rejected_once_no_longer_pending():
    booking, visitor = _make_pending_booking()
    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status"])

    with pytest.raises(Conflict):
        services.reschedule_booking(
            booking=booking, visitor=visitor, new_visit_date=TOMORROW + timedelta(days=5)
        )


# --------------------------------------------------------------------------
# list_my_bookings / list_bookings_for_staff
# --------------------------------------------------------------------------


def test_list_my_bookings_only_returns_own_bookings():
    visitor = _make_visitor()
    other = _make_visitor(email="other@example.com")
    category = _make_category()
    mine = services.create_booking(
        visitor=visitor,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=1,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    services.create_booking(
        visitor=other,
        category_id=category.id,
        visit_date=TOMORROW,
        quantity=1,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    results = services.list_my_bookings(visitor=visitor)

    assert [b.id for b in results] == [mine.id]


def test_list_bookings_for_staff_filters_by_status():
    booking, _visitor = _make_pending_booking()

    matching = services.list_bookings_for_staff(status=Booking.Status.PENDING)
    non_matching = services.list_bookings_for_staff(status=Booking.Status.CANCELLED)

    assert [b.id for b in matching] == [booking.id]
    assert list(non_matching) == []
