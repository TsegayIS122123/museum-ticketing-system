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
from apps.bookings.models import Booking, BookingItem
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
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=quantity,
        total_amount_etb=category.price_etb * quantity,
        status=Booking.Status.PENDING,
    )
    BookingItem.objects.create(
        booking=booking,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        quantity=quantity,
        subtotal_etb=category.price_etb * quantity,
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
#
# UAT round 1: check_in_booking no longer takes an attended_items payload
# -- every item's attended_quantity is simply set equal to its own
# quantity, because a mismatch can no longer reach this call at all (see
# the function's own docstring). The old per-item attendance-input tests
# (missing/unknown item, exceeding quantity, negative, zero, partial
# shortfall) are gone with that input; what replaces them is
# flag_booking_mismatch's own test block below, plus the new
# rejects-a-flagged-booking test here.
# --------------------------------------------------------------------------


def test_check_in_marks_visited_and_attends_full_quantity():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    booking = services.check_in_booking(booking=booking, actor=cashier)

    assert booking.status == Booking.Status.VISITED
    assert booking.attended_quantity == 20
    assert booking.checked_in_by_user_id_id == cashier.id
    assert booking.checked_in_at is not None
    AuditLogEntry.objects.get(action="booking.checked_in")


def test_check_in_attends_every_item_at_its_own_quantity():
    # 3 Adult + 4 Student booked together -- both items must come out of
    # check-in with attended_quantity == quantity, unconditionally.
    visitor = _make_visitor()
    adult = Category.objects.create(name_en="Adult", name_am="Adult", price_etb=Decimal("100"))
    student = Category.objects.create(name_en="Student", name_am="Student", price_etb=Decimal("30"))
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=7,
        total_amount_etb=Decimal("420"),
        status=Booking.Status.PENDING,
    )
    adult_item = BookingItem.objects.create(
        booking=booking,
        category=adult,
        category_name_en=adult.name_en,
        category_name_am=adult.name_am,
        unit_price_etb=adult.price_etb,
        quantity=3,
        subtotal_etb=Decimal("300"),
    )
    student_item = BookingItem.objects.create(
        booking=booking,
        category=student,
        category_name_en=student.name_en,
        category_name_am=student.name_am,
        unit_price_etb=student.price_etb,
        quantity=4,
        subtotal_etb=Decimal("120"),
    )
    cashier = _make_cashier()

    booking = services.check_in_booking(booking=booking, actor=cashier)

    assert booking.attended_quantity == 7
    adult_item.refresh_from_db()
    student_item.refresh_from_db()
    assert adult_item.attended_quantity == 3
    assert student_item.attended_quantity == 4


@pytest.mark.parametrize(
    "status",
    [
        Booking.Status.AWAITING_PAYMENT,
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
        services.check_in_booking(booking=booking, actor=cashier)


def test_check_in_already_visited_booking_cannot_be_checked_in_again():
    """FR-TICKET-003: once checked in, it's no longer Pending -- a second
    check-in attempt (e.g. a duplicate scan) must not silently repeat it."""
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()
    services.check_in_booking(booking=booking, actor=cashier)

    with pytest.raises(Conflict):
        services.check_in_booking(booking=booking, actor=cashier)


def test_check_in_rejects_a_flagged_booking():
    """The whole point of the round-1 policy change: a mismatch flag
    blocks check-in outright, even though the booking is still
    Pending, until a Museum Manager correction clears it."""
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()
    services.flag_booking_mismatch(booking=booking, actor=cashier)

    with pytest.raises(Conflict):
        services.check_in_booking(booking=booking, actor=cashier)


def test_check_in_succeeds_once_a_correction_clears_the_flag():
    from apps.accounts.models import Account
    from apps.bookings import services as bookings_services

    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()
    services.flag_booking_mismatch(booking=booking, actor=cashier, note="only 18 showed")
    manager = Account(
        email="manager@example.com", full_name="Manager", role=Account.Role.MUSEUM_MANAGER
    )
    manager.set_password("a-strong-password-1")
    manager.save()
    (item,) = booking.items.all()
    bookings_services.correct_booking_category(
        booking=booking, item_id=item.id, actor=manager, quantity=18
    )
    booking.refresh_from_db()
    assert booking.flagged_mismatch_at is None

    booking = services.check_in_booking(booking=booking, actor=cashier)

    assert booking.status == Booking.Status.VISITED
    assert booking.attended_quantity == 18


# --------------------------------------------------------------------------
# flag_booking_mismatch (UAT round 1, Document 02 Sec 2.5's policy update)
# --------------------------------------------------------------------------


def test_flag_booking_mismatch_leaves_status_and_quantities_untouched():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()
    (item,) = booking.items.all()

    booking = services.flag_booking_mismatch(booking=booking, actor=cashier)

    assert booking.status == Booking.Status.PENDING
    assert booking.booked_quantity == 20
    item.refresh_from_db()
    assert item.quantity == 20


def test_flag_booking_mismatch_records_who_and_when():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    booking = services.flag_booking_mismatch(booking=booking, actor=cashier, note="2 no-shows")

    assert booking.flagged_mismatch_at is not None
    assert booking.flagged_mismatch_by_user_id_id == cashier.id
    assert booking.flagged_mismatch_note == "2 no-shows"
    AuditLogEntry.objects.get(action="booking.flagged_mismatch")


def test_flag_booking_mismatch_note_is_optional():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_cashier()

    booking = services.flag_booking_mismatch(booking=booking, actor=cashier)

    assert booking.flagged_mismatch_note is None


def test_flag_booking_mismatch_rejects_non_pending_booking():
    booking = _make_pending_booking(quantity=20)
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status"])
    cashier = _make_cashier()

    with pytest.raises(Conflict):
        services.flag_booking_mismatch(booking=booking, actor=cashier)


# --------------------------------------------------------------------------
# compute_attended_amount_etb -- the IFMIS voucher must reflect who
# actually attended, never the full booked amount (the bug this covers:
# a shortfall's worth of money is refund-eligible, not museum revenue).
#
# UAT round 1's check_in_booking can no longer itself produce a
# shortfall (attended is always set equal to booked -- see that
# function's own docstring), so the shortfall-scenario tests below set
# `attended_quantity` directly rather than going through check_in_booking,
# to cover compute_attended_amount_etb's own (still-needed, for legacy
# rows checked in under the pre-round-1 flow) shortfall-handling logic in
# isolation.
# --------------------------------------------------------------------------


def test_attended_amount_full_attendance_equals_total_amount():
    booking = _make_pending_booking(quantity=20)  # unit price 50.00
    cashier = _make_cashier()
    booking = services.check_in_booking(booking=booking, actor=cashier)

    assert services.compute_attended_amount_etb(booking=booking) == Decimal("1000.00")
    assert services.compute_attended_amount_etb(booking=booking) == booking.total_amount_etb


def test_attended_amount_reflects_shortfall_not_full_booked_amount():
    """The bug report: a voucher for a booking with a shortfall must not
    be for the whole booked amount -- only for who showed up. Simulates a
    legacy row checked in under the pre-round-1 flow, by setting
    attended_quantity directly rather than via check_in_booking (see the
    section docstring above)."""
    booking = _make_pending_booking(quantity=20)  # unit price 50.00
    (item,) = booking.items.all()
    item.attended_quantity = 15
    item.save(update_fields=["attended_quantity"])
    booking.attended_quantity = 15
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["attended_quantity", "status"])

    assert services.compute_attended_amount_etb(booking=booking) == Decimal("750.00")
    assert services.compute_attended_amount_etb(booking=booking) != booking.total_amount_etb


def test_attended_amount_per_category_mixed_shortfall():
    """3 Adult (100.00) + 4 Student (50.00) booked; 1 Adult and 2 Student
    no-shows. The voucher must reflect 2*100 + 2*50 = 300.00, not a
    blended average across every category on the booking. Simulates a
    legacy row (see the section docstring above) by setting each item's
    attended_quantity directly."""
    visitor = _make_visitor()
    adult = Category.objects.create(name_en="Adult", name_am="Adult", price_etb=Decimal("100.00"))
    student = _make_category(price_etb="50.00")
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=7,
        total_amount_etb=Decimal("500.00"),
        status=Booking.Status.VISITED,
        attended_quantity=4,
    )
    BookingItem.objects.create(
        booking=booking,
        category=adult,
        category_name_en=adult.name_en,
        category_name_am=adult.name_am,
        unit_price_etb=adult.price_etb,
        quantity=3,
        subtotal_etb=adult.price_etb * 3,
        attended_quantity=2,
    )
    BookingItem.objects.create(
        booking=booking,
        category=student,
        category_name_en=student.name_en,
        category_name_am=student.name_am,
        unit_price_etb=student.price_etb,
        quantity=4,
        subtotal_etb=student.price_etb * 4,
        attended_quantity=2,
    )

    assert services.compute_attended_amount_etb(booking=booking) == Decimal("300.00")


def test_attended_amount_falls_back_to_total_before_check_in():
    """Before check-in, no `attended_quantity` exists yet on any item --
    fall back to the full booked amount rather than treating "not
    attended yet" as "zero attended"."""
    booking = _make_pending_booking(quantity=20)

    assert services.compute_attended_amount_etb(booking=booking) == booking.total_amount_etb
