"""
Unit tests for the Phase 7b (UAT round 1) report functions in
reporting/services.py -- institutions/categories/attendance/revenue
reports, `resolve_report_range`, and `get_period_comparison`.

`test_services.py`'s own `_make_booking` never sets `attended_quantity`
(every existing test either doesn't need it or sets it directly) --
`_make_visited_booking` below is this file's own equivalent, defaulting
attended = booked (Phase 3's "always full at check-in" rule) with an
explicit override for the shortfall-specific tests that need one.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem
from apps.catalog.models import Category
from apps.institutions.models import Institution
from apps.payments.models import Payment
from apps.reporting import services

pytestmark = pytest.mark.django_db

TODAY = timezone.localdate()


def _make_visitor(email="visitor@example.com"):
    account = Account(
        email=email,
        phone=f"+2519{abs(hash(email)) % 10_000_000:07d}",
        full_name="Visitor Person",
        role=Account.Role.VISITOR,
    )
    account.set_unusable_password()
    account.save()
    return account


def _make_category(name_en="Adult", price=Decimal("100.00")):
    return Category.objects.create(name_en=name_en, name_am=name_en, price_etb=price)


def _make_visited_booking(
    *,
    category,
    booked_quantity=1,
    attended_quantity=None,
    visit_date=TODAY,
    booking_type=Booking.BookingType.INDIVIDUAL,
    group_name=None,
    group_tin=None,
    institution=None,
    unit_price=None,
    checked_in_at=None,
):
    visitor = _make_visitor(email=f"visitor-{Account.objects.count()}@example.com")
    unit_price = unit_price if unit_price is not None else category.price_etb
    attended = booked_quantity if attended_quantity is None else attended_quantity
    if group_tin is None and group_name is not None:
        group_tin = "0000900158"
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=visit_date,
        booking_type=booking_type,
        group_name=group_name,
        group_tin=group_tin,
        institution=institution,
        booked_quantity=booked_quantity,
        attended_quantity=attended,
        total_amount_etb=unit_price * booked_quantity,
        status=Booking.Status.VISITED,
        checked_in_at=checked_in_at or timezone.now(),
    )
    BookingItem.objects.create(
        booking=booking,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=unit_price,
        quantity=booked_quantity,
        attended_quantity=attended,
        subtotal_etb=unit_price * booked_quantity,
    )
    Payment.objects.create(
        booking=booking,
        tx_ref=f"tx-{Payment.objects.count()}-{booking.id}",
        amount_etb=unit_price * booked_quantity,
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )
    return booking


# --------------------------------------------------------------------------
# resolve_report_range
# --------------------------------------------------------------------------


def test_resolve_report_range_explicit_from_to_wins():
    result = services.resolve_report_range(
        preset="this_quarter", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31)
    )
    assert result == (date(2026, 1, 1), date(2026, 1, 31))


def test_resolve_report_range_requires_both_from_and_to():
    with pytest.raises(ValidationError):
        services.resolve_report_range(date_from=date(2026, 1, 1))


def test_resolve_report_range_requires_a_preset_without_from_to():
    with pytest.raises(ValidationError):
        services.resolve_report_range()


def test_resolve_report_range_rejects_unknown_preset():
    with pytest.raises(ValidationError):
        services.resolve_report_range(preset="not-a-real-preset")


def test_resolve_report_range_custom_requires_from_to():
    with pytest.raises(ValidationError):
        services.resolve_report_range(preset="custom")


def test_resolve_report_range_last_30_days():
    date_from, date_to = services.resolve_report_range(preset="last_30_days")
    assert date_to == TODAY
    assert (date_to - date_from).days == 29


def test_resolve_report_range_this_quarter_contains_today():
    date_from, date_to = services.resolve_report_range(preset="this_quarter")
    assert date_from <= TODAY <= date_to
    assert date_from.month in (1, 4, 7, 10)


def test_resolve_report_range_last_quarter_is_before_this_quarter():
    this_from, _ = services.resolve_report_range(preset="this_quarter")
    _, last_to = services.resolve_report_range(preset="last_quarter")
    assert last_to < this_from


def test_resolve_report_range_delegates_daily_to_resolve_period_range():
    date_from, date_to = services.resolve_report_range(preset="daily")
    assert date_from == date_to == TODAY


# --------------------------------------------------------------------------
# get_institutions_report
# --------------------------------------------------------------------------


def test_institutions_report_groups_by_institution():
    category = _make_category()
    institution = Institution.objects.create(name="Example School", tin="0000900158")
    _make_visited_booking(
        category=category,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example School",
        institution=institution,
        booked_quantity=10,
    )
    _make_visited_booking(
        category=category,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example School",
        institution=institution,
        booked_quantity=5,
    )

    report = services.get_institutions_report(date_from=TODAY, date_to=TODAY)

    assert len(report["data"]) == 1
    row = report["data"][0]
    assert row["visit_count"] == 2
    assert row["booked_total"] == 15
    assert row["attended_total"] == 15
    assert row["revenue_etb"] == Decimal("1500.00")


def test_institutions_report_falls_back_to_group_snapshot_without_institution():
    """A legacy group booking with no linked Institution still shows up,
    keyed by its own group_name/group_tin snapshot."""
    category = _make_category()
    _make_visited_booking(
        category=category,
        booking_type=Booking.BookingType.GROUP,
        group_name="Unlinked School",
        institution=None,
        booked_quantity=8,
    )

    report = services.get_institutions_report(date_from=TODAY, date_to=TODAY)

    assert len(report["data"]) == 1
    assert report["data"][0]["name"] == "Unlinked School"
    assert report["data"][0]["institution_id"] is None


def test_institutions_report_excludes_individual_bookings():
    category = _make_category()
    _make_visited_booking(category=category, booking_type=Booking.BookingType.INDIVIDUAL)

    report = services.get_institutions_report(date_from=TODAY, date_to=TODAY)

    assert report["data"] == []


def test_institutions_report_filters_by_institution_id():
    category = _make_category()
    a = Institution.objects.create(name="School A", tin="0000900158")
    b = Institution.objects.create(name="School B", tin="0012345678")
    _make_visited_booking(
        category=category, booking_type=Booking.BookingType.GROUP, group_name="School A", institution=a
    )
    _make_visited_booking(
        category=category, booking_type=Booking.BookingType.GROUP, group_name="School B", institution=b
    )

    report = services.get_institutions_report(date_from=TODAY, date_to=TODAY, institution_id=a.id)

    assert len(report["data"]) == 1
    assert report["data"][0]["institution_id"] == a.id


def test_institutions_report_pagination():
    category = _make_category()
    for i in range(3):
        institution = Institution.objects.create(name=f"School {i}", tin=f"000090015{i}")
        _make_visited_booking(
            category=category,
            booking_type=Booking.BookingType.GROUP,
            group_name=f"School {i}",
            institution=institution,
        )

    report = services.get_institutions_report(date_from=TODAY, date_to=TODAY, limit=2, offset=0)

    assert len(report["data"]) == 2
    assert report["meta"]["total"] == 3


def test_institutions_report_rejects_from_after_to():
    with pytest.raises(ValidationError):
        services.get_institutions_report(date_from=TODAY, date_to=TODAY - timedelta(days=1))


# --------------------------------------------------------------------------
# get_institution_detail
# --------------------------------------------------------------------------


def test_institution_detail_lists_visits_with_headcount():
    category = _make_category(name_en="Student")
    institution = Institution.objects.create(name="Example School", tin="0000900158")
    _make_visited_booking(
        category=category,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example School",
        institution=institution,
        booked_quantity=12,
    )

    detail = services.get_institution_detail(institution_id=institution.id)

    assert detail["institution"]["name"] == "Example School"
    assert len(detail["visits"]) == 1
    assert detail["visits"][0]["headcount_by_category"] == {"Student": 12}


def test_institution_detail_raises_not_found_for_unknown_institution():
    import uuid

    with pytest.raises(NotFound):
        services.get_institution_detail(institution_id=uuid.uuid4())


def test_institution_detail_date_range_is_both_or_neither():
    institution = Institution.objects.create(name="Example School", tin="0000900158")
    with pytest.raises(ValidationError):
        services.get_institution_detail(institution_id=institution.id, date_from=TODAY)


# --------------------------------------------------------------------------
# get_categories_report
# --------------------------------------------------------------------------


def test_categories_report_revenue_share_sums_to_100_percent():
    adult = _make_category(name_en="Adult", price=Decimal("100.00"))
    student = _make_category(name_en="Student", price=Decimal("50.00"))
    _make_visited_booking(category=adult, booked_quantity=1)
    _make_visited_booking(category=student, booked_quantity=1)

    report = services.get_categories_report(date_from=TODAY, date_to=TODAY)

    shares = {row["category"]: row["revenue_share_pct"] for row in report["categories"]}
    assert shares["Adult"] + shares["Student"] == pytest.approx(100.0)


def test_categories_report_revenue_share_is_none_when_no_revenue():
    category = _make_category()
    booking = _make_visited_booking(category=category)
    Payment.objects.filter(booking=booking).delete()

    report = services.get_categories_report(date_from=TODAY, date_to=TODAY)

    assert report["categories"][0]["revenue_share_pct"] is None


def test_categories_report_granularity_daily_for_short_range():
    category = _make_category()
    _make_visited_booking(category=category)

    report = services.get_categories_report(date_from=TODAY, date_to=TODAY)

    assert report["granularity"] == "daily"


def test_categories_report_granularity_monthly_for_long_range():
    category = _make_category()
    report = services.get_categories_report(
        date_from=TODAY - timedelta(days=400), date_to=TODAY
    )
    assert report["granularity"] == "monthly"


# --------------------------------------------------------------------------
# get_attendance_report
# --------------------------------------------------------------------------


def test_attendance_report_full_attendance_has_zero_shortfall():
    category = _make_category()
    _make_visited_booking(category=category, booked_quantity=10)

    report = services.get_attendance_report(date_from=TODAY, date_to=TODAY)

    assert report["booked_total"] == 10
    assert report["attended_total"] == 10
    assert report["shortfall_total"] == 0
    assert report["shortfall_rate_pct"] == 0.0


def test_attendance_report_shortfall_rate_for_legacy_partial_attendance():
    category = _make_category()
    _make_visited_booking(category=category, booked_quantity=10, attended_quantity=7)

    report = services.get_attendance_report(date_from=TODAY, date_to=TODAY)

    assert report["shortfall_total"] == 3
    assert report["shortfall_rate_pct"] == 30.0


def test_attendance_report_no_bookings_shortfall_rate_is_none():
    report = services.get_attendance_report(date_from=TODAY, date_to=TODAY)
    assert report["shortfall_rate_pct"] is None


def test_attendance_report_counts_currently_flagged_bookings():
    from apps.entrance import services as entrance_services

    category = _make_category()
    booking = _make_visited_booking(category=category)
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])
    cashier = Account(email="cashier@example.com", full_name="Cashier", role=Account.Role.CASHIER)
    cashier.set_password("a-strong-password-1")
    cashier.save()
    entrance_services.flag_booking_mismatch(booking=booking, actor=cashier)

    report = services.get_attendance_report(date_from=TODAY, date_to=TODAY)

    assert report["currently_flagged_count"] == 1


# --------------------------------------------------------------------------
# get_revenue_report
# --------------------------------------------------------------------------


def test_revenue_report_gross_refunds_net():
    category = _make_category(price=Decimal("100.00"))
    booking = _make_visited_booking(category=category, booked_quantity=2)
    payment = Payment.objects.get(booking=booking)
    from apps.refunds.models import Refund

    Refund.objects.create(
        booking=booking,
        payment=payment,
        amount_etb=Decimal("50.00"),
        reason=Refund.Reason.PARTIAL_SHORTFALL,
        status=Refund.Status.COMPLETED,
    )

    report = services.get_revenue_report(date_from=TODAY, date_to=TODAY)

    assert report["gross_etb"] == Decimal("200.00")
    assert report["refunds_etb"] == Decimal("50.00")
    assert report["net_etb"] == Decimal("150.00")


def test_revenue_report_individual_vs_institutional_split():
    category = _make_category()
    institution = Institution.objects.create(name="Example School", tin="0000900158")
    _make_visited_booking(category=category, booking_type=Booking.BookingType.INDIVIDUAL)
    _make_visited_booking(
        category=category,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example School",
        institution=institution,
    )

    report = services.get_revenue_report(date_from=TODAY, date_to=TODAY)

    assert report["individual_etb"] == Decimal("100.00")
    assert report["institutional_etb"] == Decimal("100.00")


# --------------------------------------------------------------------------
# get_period_comparison
# --------------------------------------------------------------------------


def test_period_comparison_computes_positive_delta():
    category = _make_category(price=Decimal("100.00"))
    _make_visited_booking(category=category, visit_date=TODAY, booked_quantity=2)
    _make_visited_booking(
        category=category, visit_date=TODAY - timedelta(days=1), booked_quantity=1
    )

    comparison = services.get_period_comparison(date_from=TODAY, date_to=TODAY)

    assert comparison["current"]["revenue_etb"] == Decimal("200.00")
    assert comparison["previous"]["revenue_etb"] == Decimal("100.00")
    assert comparison["deltas"]["revenue_etb_pct"] == 100.0


def test_period_comparison_delta_is_none_when_previous_is_zero():
    category = _make_category()
    _make_visited_booking(category=category, visit_date=TODAY)

    comparison = services.get_period_comparison(date_from=TODAY, date_to=TODAY)

    assert comparison["previous"]["revenue_etb"] == Decimal("0")
    assert comparison["deltas"]["revenue_etb_pct"] is None


def test_period_comparison_previous_range_is_immediately_preceding():
    comparison = services.get_period_comparison(
        date_from=TODAY - timedelta(days=6), date_to=TODAY
    )
    assert comparison["previous"]["to"] == TODAY - timedelta(days=7)
    assert comparison["previous"]["from"] == TODAY - timedelta(days=13)


def test_attendance_report_no_show_counts_past_pending_bookings_only():
    from datetime import timedelta

    category = _make_category()
    _make_visited_booking(category=category, booked_quantity=8, visit_date=TODAY - timedelta(days=2))
    past = _make_visited_booking(category=category, booked_quantity=2, visit_date=TODAY - timedelta(days=2))
    future = _make_visited_booking(category=category, booked_quantity=5, visit_date=TODAY + timedelta(days=3))
    Booking.objects.filter(id__in=[past.id, future.id]).update(status=Booking.Status.PENDING)

    report = services.get_attendance_report(
        date_from=TODAY - timedelta(days=2), date_to=TODAY + timedelta(days=3)
    )

    # Only the past-dated Pending booking is a no-show; the future one is not yet.
    assert report["no_show_booking_count"] == 1
    assert report["no_show_headcount"] == 2
    # 2 / (8 attended-or-booked + 2 no-show) = 20%
    assert report["no_show_rate_pct"] == 20.0
    # shortfall stays a separate figure about checked-in bookings only
    assert report["shortfall_total"] == 0


def test_attendance_report_no_show_rate_none_without_data():
    report = services.get_attendance_report(date_from=TODAY, date_to=TODAY)
    assert report["no_show_rate_pct"] is None
    assert report["no_show_booking_count"] == 0
