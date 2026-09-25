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


def _next_non_sunday(start):
    """`TOMORROW` below stands in for "some ordinary open date" across this
    whole file. Sunday is now unconditionally closed (UAT round 1), so
    pinning it to a fixed offset from `date.today()` would make every test
    that relies on it being bookable flaky one day in seven. This walks
    forward to the nearest date that isn't a Sunday instead."""
    current = start
    while current.weekday() == 6:
        current += timedelta(days=1)
    return current


TOMORROW = _next_non_sunday(date.today() + timedelta(days=1))

# A guaranteed Sunday in the near future, for the weekly-closure tests
# below -- deliberately not derived from TOMORROW, which is defined to
# avoid Sunday.
NEXT_SUNDAY = date.today() + timedelta(days=(6 - date.today().weekday()) % 7 or 7)


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
        items=[{"category_id": category.id, "quantity": 1}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    services.set_date_availability(visit_date=TOMORROW, is_open_for_booking=False, actor=manager)
    booking.refresh_from_db()

    assert booking.status == Booking.Status.AWAITING_PAYMENT


# --------------------------------------------------------------------------
# Weekly Sunday closure (UAT round 1)
# --------------------------------------------------------------------------


def test_is_recurring_closed_day_true_only_for_sunday():
    assert services.is_recurring_closed_day(NEXT_SUNDAY) is True
    assert services.is_recurring_closed_day(TOMORROW) is False


def test_sunday_with_no_row_is_closed():
    """Unlike every other weekday, a Sunday with no `DateAvailability` row
    is still closed -- the "no row means open" default (FR-BOOK-008) never
    applies to the weekly closure."""
    assert services.is_date_open_for_booking(NEXT_SUNDAY) is False


def test_sunday_row_saying_open_is_still_closed():
    """A row that predates the weekly-closure rule (or was written by some
    other path) can't override it -- the rule always wins."""
    DateAvailability.objects.create(visit_date=NEXT_SUNDAY, is_open_for_booking=True)

    assert services.is_date_open_for_booking(NEXT_SUNDAY) is False


def test_manager_cannot_open_a_sunday():
    manager = _make_manager()

    with pytest.raises(Conflict):
        services.set_date_availability(
            visit_date=NEXT_SUNDAY, is_open_for_booking=True, actor=manager
        )


def test_manager_can_close_a_sunday_without_error():
    """Closing a Sunday is a no-op the weekly rule already guarantees, so
    it's allowed through rather than rejected."""
    manager = _make_manager()

    row = services.set_date_availability(
        visit_date=NEXT_SUNDAY, is_open_for_booking=False, actor=manager
    )

    assert row.is_open_for_booking is False


def test_list_date_availability_marks_sunday_closed_with_weekly_reason():
    from apps.bookings.serializers import DateAvailabilitySerializer

    [result] = services.list_date_availability(date_from=NEXT_SUNDAY, date_to=NEXT_SUNDAY)

    assert result.is_open_for_booking is False
    data = DateAvailabilitySerializer(result).data
    assert data["closedReason"] == "weekly_closure"


def test_list_date_availability_marks_sunday_closed_even_with_stale_open_row():
    DateAvailability.objects.create(visit_date=NEXT_SUNDAY, is_open_for_booking=True)

    [result] = services.list_date_availability(date_from=NEXT_SUNDAY, date_to=NEXT_SUNDAY)

    assert result.is_open_for_booking is False


def test_list_date_availability_manager_closed_reason_for_ordinary_date():
    from apps.bookings.serializers import DateAvailabilitySerializer

    DateAvailability.objects.create(visit_date=TOMORROW, is_open_for_booking=False)

    [result] = services.list_date_availability(date_from=TOMORROW, date_to=TOMORROW)

    data = DateAvailabilitySerializer(result).data
    assert data["closedReason"] == "manager_closed"


def test_list_date_availability_open_date_has_null_reason():
    from apps.bookings.serializers import DateAvailabilitySerializer

    [result] = services.list_date_availability(date_from=TOMORROW, date_to=TOMORROW)

    data = DateAvailabilitySerializer(result).data
    assert data["closedReason"] is None


def test_create_booking_rejected_on_sunday():
    visitor = _make_visitor()
    category = _make_category()

    with pytest.raises(Conflict):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 1}],
            visit_date=NEXT_SUNDAY,
            booking_type=Booking.BookingType.INDIVIDUAL,
        )


def test_group_booking_rejected_on_sunday():
    visitor = _make_visitor()
    category = _make_category()

    with pytest.raises(Conflict):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 20}],
            visit_date=NEXT_SUNDAY,
            booking_type=Booking.BookingType.GROUP,
            group_name="A School",
            group_tin="0012345678",
        )


# --------------------------------------------------------------------------
# create_booking (FR-BOOK-001, FR-BOOK-003)
# --------------------------------------------------------------------------


def test_create_individual_booking_starts_awaiting_payment():
    visitor = _make_visitor()
    category = _make_category(price_etb="50.00")

    booking = services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": 2}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.total_amount_etb == Decimal("100.00")
    assert booking.items.get().category_name_en == category.name_en
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
        items=[{"category_id": category.id, "quantity": 30}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example Primary School",
        group_tin="0000900158",
    )

    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.group_tin == "0000900158"
    assert booking.institution is not None
    assert booking.institution.tin == "0000900158"
    assert booking.institution.name == "Example Primary School"


def test_create_group_booking_reuses_existing_institution_for_same_tin():
    """UAT round 1: two bookings from the same school, by different
    visitors, resolve to one shared `Institution` row rather than two
    independent ones -- see `apps.institutions.services.
    resolve_institution`."""
    category = _make_category()
    first_visitor = _make_visitor(email="teacher1@example.com")
    second_visitor = _make_visitor(email="teacher2@example.com")

    first = services.create_booking(
        visitor=first_visitor,
        items=[{"category_id": category.id, "quantity": 20}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example Primary School",
        group_tin="0000900158",
    )
    second = services.create_booking(
        visitor=second_visitor,
        items=[{"category_id": category.id, "quantity": 15}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example Primary School",
        group_tin="0000900158",
    )

    assert first.institution_id == second.institution_id


def test_create_group_booking_rejects_malformed_tin():
    visitor = _make_visitor()
    category = _make_category()

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 30}],
            visit_date=TOMORROW,
            booking_type=Booking.BookingType.GROUP,
            group_name="Example Primary School",
            group_tin="123",
        )


def test_create_group_booking_normalizes_tin_with_separators():
    """A booker typing "0000-900158" or "0000 900158" still resolves to
    the same institution as the clean digit string -- see
    `apps.institutions.services.normalize_tin`."""
    visitor = _make_visitor()
    category = _make_category()

    booking = services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": 30}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example Primary School",
        group_tin="0000-900158",
    )

    assert booking.group_tin == "0000900158"
    assert booking.institution.tin == "0000900158"


def test_create_group_booking_requires_group_name():
    visitor = _make_visitor()
    category = _make_category()

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 30}],
            visit_date=TOMORROW,
            booking_type=Booking.BookingType.GROUP,
            group_tin="0000900158",
        )


def test_create_group_booking_requires_group_tin():
    visitor = _make_visitor()
    category = _make_category()

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 30}],
            visit_date=TOMORROW,
            booking_type=Booking.BookingType.GROUP,
            group_name="Example Primary School",
        )


def test_create_individual_booking_never_sets_group_tin():
    visitor = _make_visitor()
    category = _make_category()

    booking = services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": 1}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    assert booking.group_tin is None


def test_create_booking_rejected_for_unverified_visitor():
    visitor = _make_visitor(verified=False)
    category = _make_category()

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 1}],
            visit_date=TOMORROW,
            booking_type=Booking.BookingType.INDIVIDUAL,
        )


def test_create_booking_rejected_for_inactive_category():
    visitor = _make_visitor()
    category = _make_category(active=False)

    with pytest.raises(ValidationError):
        services.create_booking(
            visitor=visitor,
            items=[{"category_id": category.id, "quantity": 1}],
            visit_date=TOMORROW,
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
            items=[{"category_id": category.id, "quantity": 1}],
            visit_date=TOMORROW,
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


def _make_correctable_booking(category, quantity=1, visitor=None):
    visitor = visitor or _make_visitor()
    booking = services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": quantity}],
        visit_date=TOMORROW,
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
    item = booking.items.get()
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, item_id=item.id, category_id=non_resident.id, actor=cashier
    )

    item.refresh_from_db()
    assert delta == Decimal("450.00")
    assert item.category_id == non_resident.id
    assert item.unit_price_etb == Decimal("500.00")
    assert item.subtotal_etb == Decimal("500.00")
    assert booking.total_amount_etb == Decimal("500.00")
    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.category_corrected_by_user_id_id == cashier.id
    assert booking.category_corrected_at is not None


def test_correct_category_to_a_cheaper_one_leaves_booking_pending():
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(non_resident)
    item = booking.items.get()
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, item_id=item.id, category_id=student.id, actor=cashier
    )

    assert delta == Decimal("-450.00")
    assert booking.total_amount_etb == Decimal("50.00")
    # Overcharge doesn't block check-in -- only an undercharge does.
    assert booking.status == Booking.Status.PENDING


def test_correct_category_scales_with_item_quantity():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult / Teacher", price_etb="100.00")
    booking = _make_correctable_booking(student, quantity=30)
    item = booking.items.get()
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, item_id=item.id, category_id=adult.id, actor=cashier
    )

    assert delta == Decimal("1500.00")
    assert booking.total_amount_etb == Decimal("3000.00")


def test_correct_category_on_a_mixed_booking_only_touches_the_given_item():
    """A father's booking: one Adult ticket for himself, two Student
    tickets for his kids. The gate finds one of the kids has no valid
    student ID -- only that one item is corrected, the Adult item and
    its own subtotal are untouched, and the booking's total reflects
    just that one item's price change."""
    adult = _make_category(name_en="Adult", price_etb="100.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    visitor = _make_visitor()
    booking = services.create_booking(
        visitor=visitor,
        items=[
            {"category_id": adult.id, "quantity": 1},
            {"category_id": student.id, "quantity": 2},
        ],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status", "updated_at"])
    student_item = booking.items.get(category=student)
    adult_item = booking.items.get(category=adult)
    cashier = _make_cashier()

    # old total: 100 + (2 x 50) = 200.00
    booking, delta = services.correct_booking_category(
        booking=booking, item_id=student_item.id, category_id=non_resident.id, actor=cashier
    )

    student_item.refresh_from_db()
    adult_item.refresh_from_db()
    assert student_item.category_id == non_resident.id
    assert student_item.subtotal_etb == Decimal("1000.00")  # 500 x 2
    assert adult_item.category_id == adult.id  # untouched
    assert adult_item.subtotal_etb == Decimal("100.00")  # untouched
    assert booking.total_amount_etb == Decimal("1100.00")  # 100 + 1000
    assert delta == Decimal("900.00")  # 1100 - 200


def test_correct_category_rejected_once_no_longer_pending():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult / Teacher", price_etb="100.00")
    booking = _make_correctable_booking(student)
    item = booking.items.get()
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status", "updated_at"])
    cashier = _make_cashier()

    with pytest.raises(Conflict):
        services.correct_booking_category(
            booking=booking, item_id=item.id, category_id=adult.id, actor=cashier
        )


def test_correct_category_rejects_the_same_category():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student)
    item = booking.items.get()
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(
            booking=booking, item_id=item.id, category_id=student.id, actor=cashier
        )


# --------------------------------------------------------------------------
# correct_booking_category: quantity correction (over/under/combined)
# --------------------------------------------------------------------------


def test_correct_quantity_upward_reopens_payment_for_the_difference():
    """3 people show up under a ticket line originally booked for 2."""
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student, quantity=2)
    item = booking.items.get()
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, item_id=item.id, quantity=3, actor=cashier
    )

    item.refresh_from_db()
    assert delta == Decimal("50.00")  # (3 - 2) x 50
    assert item.quantity == 3
    assert item.category_id == student.id  # untouched
    assert item.subtotal_etb == Decimal("150.00")
    assert booking.total_amount_etb == Decimal("150.00")
    assert booking.booked_quantity == 3
    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.category_corrected_by_user_id_id == cashier.id
    assert booking.category_corrected_at is not None


def test_correct_quantity_downward_issues_a_refund_and_leaves_booking_pending():
    """Party of 3 booked under one line, but only 2 actually show up
    under it."""
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student, quantity=3)
    item = booking.items.get()
    cashier = _make_cashier()

    booking, delta = services.correct_booking_category(
        booking=booking, item_id=item.id, quantity=2, actor=cashier
    )

    item.refresh_from_db()
    assert delta == Decimal("-50.00")  # (2 - 3) x 50
    assert item.quantity == 2
    assert item.subtotal_etb == Decimal("100.00")
    assert booking.total_amount_etb == Decimal("100.00")
    assert booking.booked_quantity == 2
    # Overcharge doesn't block check-in -- only an undercharge does.
    assert booking.status == Booking.Status.PENDING


def test_correct_quantity_and_category_together_computes_a_single_combined_delta():
    """One of three "Student" ticket-holders has no valid student ID
    *and* it turns out only one of the remaining two actually showed up
    under that ticket -- both are corrected in the same request, against
    a single combined delta rather than two separate ones."""
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult", price_etb="100.00")
    booking = _make_correctable_booking(student, quantity=3)
    item = booking.items.get()
    cashier = _make_cashier()

    # old subtotal: 3 x 50 = 150.00; new subtotal: 1 x 100 = 100.00
    booking, delta = services.correct_booking_category(
        booking=booking, item_id=item.id, category_id=adult.id, quantity=1, actor=cashier
    )

    item.refresh_from_db()
    assert delta == Decimal("-50.00")
    assert item.category_id == adult.id
    assert item.quantity == 1
    assert item.unit_price_etb == Decimal("100.00")
    assert item.subtotal_etb == Decimal("100.00")
    assert booking.total_amount_etb == Decimal("100.00")
    assert booking.booked_quantity == 1
    assert booking.status == Booking.Status.PENDING


def test_correct_quantity_on_a_mixed_booking_only_touches_the_given_item():
    adult = _make_category(name_en="Adult", price_etb="100.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    visitor = _make_visitor()
    booking = services.create_booking(
        visitor=visitor,
        items=[
            {"category_id": adult.id, "quantity": 1},
            {"category_id": student.id, "quantity": 2},
        ],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status", "updated_at"])
    student_item = booking.items.get(category=student)
    adult_item = booking.items.get(category=adult)
    cashier = _make_cashier()

    # old total: 100 + (2 x 50) = 200.00
    booking, delta = services.correct_booking_category(
        booking=booking, item_id=student_item.id, quantity=3, actor=cashier
    )

    student_item.refresh_from_db()
    adult_item.refresh_from_db()
    assert student_item.quantity == 3
    assert student_item.subtotal_etb == Decimal("150.00")
    assert adult_item.quantity == 1  # untouched
    assert adult_item.subtotal_etb == Decimal("100.00")  # untouched
    assert booking.total_amount_etb == Decimal("250.00")  # 100 + 150
    assert booking.booked_quantity == 4  # 1 + 3
    assert delta == Decimal("50.00")  # 250 - 200


def test_correct_quantity_requires_at_least_category_or_quantity():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student)
    item = booking.items.get()
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(booking=booking, item_id=item.id, actor=cashier)


def test_correct_quantity_rejects_less_than_one():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student, quantity=2)
    item = booking.items.get()
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(
            booking=booking, item_id=item.id, quantity=0, actor=cashier
        )


def test_correct_quantity_rejects_the_same_quantity_when_category_unchanged():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student, quantity=2)
    item = booking.items.get()
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(
            booking=booking, item_id=item.id, quantity=2, actor=cashier
        )


def test_correct_quantity_rejected_once_no_longer_pending():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student, quantity=2)
    item = booking.items.get()
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status", "updated_at"])
    cashier = _make_cashier()

    with pytest.raises(Conflict):
        services.correct_booking_category(
            booking=booking, item_id=item.id, quantity=3, actor=cashier
        )


def test_correct_category_rejects_an_inactive_category():
    student = _make_category(name_en="Student", price_etb="50.00")
    retired = _make_category(name_en="Retired Category", price_etb="10.00", active=False)
    booking = _make_correctable_booking(student)
    item = booking.items.get()
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(
            booking=booking, item_id=item.id, category_id=retired.id, actor=cashier
        )


def test_correct_category_rejects_an_item_not_on_this_booking():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult", price_etb="100.00")
    booking = _make_correctable_booking(student)
    other_booking = _make_correctable_booking(
        student, visitor=_make_visitor(email="other-visitor@example.com")
    )
    other_item = other_booking.items.get()
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(
            booking=booking, item_id=other_item.id, category_id=adult.id, actor=cashier
        )


def test_correct_category_rejects_a_category_another_item_already_has():
    adult = _make_category(name_en="Adult", price_etb="100.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    visitor = _make_visitor()
    booking = services.create_booking(
        visitor=visitor,
        items=[
            {"category_id": adult.id, "quantity": 1},
            {"category_id": student.id, "quantity": 2},
        ],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status", "updated_at"])
    student_item = booking.items.get(category=student)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.correct_booking_category(
            booking=booking, item_id=student_item.id, category_id=adult.id, actor=cashier
        )


# --------------------------------------------------------------------------
# add_booking_item (walk-up addendum)
# --------------------------------------------------------------------------


def test_add_item_creates_a_new_line_and_reopens_payment():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult", price_etb="100.00")
    booking = _make_correctable_booking(student, quantity=3)
    cashier = _make_cashier()

    booking, new_item = services.add_booking_item(
        booking=booking, category_id=adult.id, quantity=2, actor=cashier
    )

    assert new_item.category_id == adult.id
    assert new_item.quantity == 2
    assert new_item.unit_price_etb == Decimal("100.00")
    assert new_item.subtotal_etb == Decimal("200.00")
    assert booking.items.count() == 2
    assert booking.booked_quantity == 5
    assert booking.total_amount_etb == Decimal("350.00")
    assert booking.status == Booking.Status.AWAITING_PAYMENT
    assert booking.category_corrected_by_user_id_id == cashier.id
    assert booking.category_corrected_at is not None


def test_add_item_rejects_a_category_already_on_the_booking():
    student = _make_category(name_en="Student", price_etb="50.00")
    booking = _make_correctable_booking(student, quantity=3)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.add_booking_item(
            booking=booking, category_id=student.id, quantity=2, actor=cashier
        )


def test_add_item_rejects_an_inactive_category():
    student = _make_category(name_en="Student", price_etb="50.00")
    inactive = _make_category(name_en="Retired Category", price_etb="75.00", active=False)
    booking = _make_correctable_booking(student, quantity=3)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.add_booking_item(
            booking=booking, category_id=inactive.id, quantity=1, actor=cashier
        )


def test_add_item_rejects_quantity_less_than_one():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult", price_etb="100.00")
    booking = _make_correctable_booking(student, quantity=3)
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.add_booking_item(
            booking=booking, category_id=adult.id, quantity=0, actor=cashier
        )


def test_add_item_rejected_once_no_longer_pending():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult", price_etb="100.00")
    booking = _make_correctable_booking(student, quantity=3)
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status", "updated_at"])
    cashier = _make_cashier()

    with pytest.raises(Conflict):
        services.add_booking_item(
            booking=booking, category_id=adult.id, quantity=1, actor=cashier
        )


def test_add_item_on_a_mixed_booking_leaves_existing_items_untouched():
    adult = _make_category(name_en="Adult", price_etb="100.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    foreign = _make_category(name_en="Foreign Resident", price_etb="300.00")
    visitor = _make_visitor()
    booking = services.create_booking(
        visitor=visitor,
        items=[
            {"category_id": adult.id, "quantity": 1},
            {"category_id": student.id, "quantity": 2},
        ],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status", "updated_at"])
    cashier = _make_cashier()

    booking, new_item = services.add_booking_item(
        booking=booking, category_id=foreign.id, quantity=1, actor=cashier
    )

    adult_item = booking.items.get(category=adult)
    student_item = booking.items.get(category=student)
    assert adult_item.quantity == 1
    assert student_item.quantity == 2
    assert new_item.category_id == foreign.id
    assert booking.items.count() == 3
    assert booking.booked_quantity == 4
    assert booking.total_amount_etb == Decimal("500.00")


# --------------------------------------------------------------------------
# cancel_booking (FR-BOOK-005/006)
# --------------------------------------------------------------------------


def _make_pending_booking(visitor=None):
    visitor = visitor or _make_visitor()
    category = _make_category()
    booking = services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": 1}],
        visit_date=TOMORROW,
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
# cancel_awaiting_payment_booking -- the delete half of a Visitor's own
# pre-payment editing capability (BookingCancelView's own docstring).
# Sibling of cancel_booking above, but for a booking that never got past
# AwaitingPayment: no money was ever collected, so unlike cancel_booking
# there is no refund to trigger -- see the function's own docstring for
# why that's a deliberately separate code path rather than a shared one.
# --------------------------------------------------------------------------


def _make_awaiting_payment_booking(visitor=None):
    visitor = visitor or _make_visitor()
    category = _make_category()
    booking = services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": 1}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    return booking, visitor


def test_cancel_awaiting_payment_booking_succeeds():
    booking, visitor = _make_awaiting_payment_booking()

    booking = services.cancel_awaiting_payment_booking(booking=booking, visitor=visitor)

    assert booking.status == Booking.Status.CANCELLED
    assert AuditLogEntry.objects.filter(action="booking.cancelled_before_payment").exists()


def test_cancel_awaiting_payment_booking_rejected_once_no_longer_awaiting_payment():
    booking, visitor = _make_awaiting_payment_booking()
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])

    with pytest.raises(Conflict):
        services.cancel_awaiting_payment_booking(booking=booking, visitor=visitor)


def test_cancel_awaiting_payment_booking_rejected_for_a_different_visitor():
    booking, _owner = _make_awaiting_payment_booking()
    someone_else = _make_visitor(email="someone-else@example.com")

    with pytest.raises(PermissionDenied):
        services.cancel_awaiting_payment_booking(booking=booking, visitor=someone_else)


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


def test_reschedule_rejected_onto_a_sunday():
    booking, visitor = _make_pending_booking()

    with pytest.raises(Conflict):
        services.reschedule_booking(booking=booking, visitor=visitor, new_visit_date=NEXT_SUNDAY)


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
        items=[{"category_id": category.id, "quantity": 1}],
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    services.create_booking(
        visitor=other,
        items=[{"category_id": category.id, "quantity": 1}],
        visit_date=TOMORROW,
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


# --------------------------------------------------------------------------
# list_bookings_for_staff(flagged=True) -- the Museum Manager's queue
# (UAT round 1)
# --------------------------------------------------------------------------


def test_list_bookings_for_staff_flagged_only_returns_flagged():
    from apps.entrance.services import flag_booking_mismatch

    flagged, _visitor = _make_pending_booking()
    _unflagged, _visitor2 = _make_pending_booking()
    cashier = _make_cashier()
    flag_booking_mismatch(booking=flagged, actor=cashier)

    results = services.list_bookings_for_staff(flagged=True)

    assert [b.id for b in results] == [flagged.id]


def test_list_bookings_for_staff_flagged_prioritizes_todays_visit_date():
    from apps.entrance.services import flag_booking_mismatch

    cashier = _make_cashier()
    later, _v1 = _make_pending_booking()
    flag_booking_mismatch(booking=later, actor=cashier)

    today_booking, _v2 = _make_pending_booking()
    Booking.objects.filter(id=today_booking.id).update(visit_date=date.today())
    today_booking.refresh_from_db()
    flag_booking_mismatch(booking=today_booking, actor=cashier)

    results = list(services.list_bookings_for_staff(flagged=True))

    assert results[0].id == today_booking.id
    assert results[1].id == later.id
