"""
Unit tests against reporting/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.payments.models import Payment
from apps.refunds.models import Refund
from apps.reporting import services

pytestmark = pytest.mark.django_db

TODAY = date.today()


# --------------------------------------------------------------------------
# Fixtures / factories
# --------------------------------------------------------------------------


def _make_visitor(email="visitor@example.com"):
    account = Account(
        email=email,
        phone=f"+2519{abs(hash(email)) % 10_000_000:07d}",
        full_name="Visitor Person",
        role=Account.Role.VISITOR,
    )
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_category(name_en="Adult", price=Decimal("100.00")):
    return Category.objects.create(name_en=name_en, name_am=name_en, price_etb=price)


def _make_booking(
    *,
    category,
    status,
    booking_type=Booking.BookingType.INDIVIDUAL,
    group_name=None,
    booked_quantity=1,
    visit_date=TODAY,
    unit_price=None,
):
    visitor = _make_visitor(email=f"visitor-{Account.objects.count()}@example.com")
    unit_price = unit_price if unit_price is not None else category.price_etb
    return Booking.objects.create(
        visitor=visitor,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=unit_price,
        visit_date=visit_date,
        booking_type=booking_type,
        group_name=group_name,
        booked_quantity=booked_quantity,
        total_amount_etb=unit_price * booked_quantity,
        status=status,
    )


def _make_completed_payment(*, booking, amount=None):
    amount = amount if amount is not None else booking.total_amount_etb
    return Payment.objects.create(
        booking=booking,
        tx_ref=f"tx-{Payment.objects.count()}-{booking.id}",
        amount_etb=amount,
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )


def _make_completed_refund(*, booking, payment, amount):
    return Refund.objects.create(
        booking=booking,
        payment=payment,
        amount_etb=amount,
        reason=Refund.Reason.PARTIAL_SHORTFALL,
        status=Refund.Status.COMPLETED,
    )


# --------------------------------------------------------------------------
# get_dashboard
# --------------------------------------------------------------------------


def test_dashboard_is_all_zero_with_no_bookings():
    dashboard = services.get_dashboard()
    assert dashboard["revenue_total_etb"] == Decimal("0")
    assert dashboard["visitor_counts_by_category"] == {}
    assert dashboard["group_vs_individual_split"] == {"group": 0, "individual": 0}
    assert dashboard["status_mix"] == {
        "pending": 0,
        "visited": 0,
        "cancelled": 0,
        "refunded": 0,
    }


def test_dashboard_excludes_awaiting_payment_bookings():
    """AwaitingPayment bookings never completed checkout -- see
    services.py module docstring on why they're excluded from every
    dashboard figure."""
    category = _make_category()
    _make_booking(category=category, status=Booking.Status.AWAITING_PAYMENT)

    dashboard = services.get_dashboard()
    assert dashboard["revenue_total_etb"] == Decimal("0")
    assert dashboard["visitor_counts_by_category"] == {}
    assert dashboard["group_vs_individual_split"] == {"group": 0, "individual": 0}


def test_dashboard_revenue_is_completed_payments_minus_completed_refunds():
    category = _make_category(price=Decimal("100.00"))
    booking = _make_booking(
        category=category, status=Booking.Status.VISITED, booked_quantity=2
    )
    payment = _make_completed_payment(booking=booking, amount=Decimal("200.00"))
    _make_completed_refund(booking=booking, payment=payment, amount=Decimal("50.00"))

    dashboard = services.get_dashboard()
    assert dashboard["revenue_total_etb"] == Decimal("150.00")


def test_dashboard_ignores_non_completed_payments_and_refunds():
    category = _make_category(price=Decimal("100.00"))
    booking = _make_booking(category=category, status=Booking.Status.PENDING)
    Payment.objects.create(
        booking=booking,
        tx_ref="tx-initiated",
        amount_etb=Decimal("100.00"),
        status=Payment.Status.INITIATED,
    )

    dashboard = services.get_dashboard()
    assert dashboard["revenue_total_etb"] == Decimal("0")


def test_dashboard_visitor_counts_by_category_sums_booked_quantity():
    adult = _make_category(name_en="Adult")
    student = _make_category(name_en="Student", price=Decimal("50.00"))
    _make_booking(category=adult, status=Booking.Status.VISITED, booked_quantity=3)
    _make_booking(category=adult, status=Booking.Status.PENDING, booked_quantity=2)
    _make_booking(category=student, status=Booking.Status.CANCELLED, booked_quantity=1)

    dashboard = services.get_dashboard()
    assert dashboard["visitor_counts_by_category"] == {"Adult": 5, "Student": 1}


def test_dashboard_group_vs_individual_split_counts_bookings():
    category = _make_category()
    _make_booking(
        category=category,
        status=Booking.Status.VISITED,
        booking_type=Booking.BookingType.GROUP,
        group_name="Addis Ababa Elementary",
    )
    _make_booking(
        category=category,
        status=Booking.Status.PENDING,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    _make_booking(
        category=category,
        status=Booking.Status.PENDING,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )

    dashboard = services.get_dashboard()
    assert dashboard["group_vs_individual_split"] == {"group": 1, "individual": 2}


def test_dashboard_status_mix_counts_each_reportable_status():
    category = _make_category()
    _make_booking(category=category, status=Booking.Status.PENDING)
    _make_booking(category=category, status=Booking.Status.VISITED)
    _make_booking(category=category, status=Booking.Status.VISITED)
    _make_booking(category=category, status=Booking.Status.CANCELLED)
    _make_booking(category=category, status=Booking.Status.REFUNDED)

    dashboard = services.get_dashboard()
    assert dashboard["status_mix"] == {
        "pending": 1,
        "visited": 2,
        "cancelled": 1,
        "refunded": 1,
    }


# --------------------------------------------------------------------------
# resolve_period_range
# --------------------------------------------------------------------------


def test_resolve_period_range_rejects_unknown_period():
    with pytest.raises(ValidationError):
        services.resolve_period_range(period="fortnightly")


def test_resolve_period_range_rejects_one_sided_date_range():
    with pytest.raises(ValidationError):
        services.resolve_period_range(period="daily", date_from=TODAY)


def test_resolve_period_range_rejects_from_after_to():
    with pytest.raises(ValidationError):
        services.resolve_period_range(
            period="daily", date_from=TODAY, date_to=TODAY - timedelta(days=1)
        )


def test_resolve_period_range_explicit_dates_win_regardless_of_period_label():
    start, end = services.resolve_period_range(
        period="daily", date_from=date(2025, 1, 1), date_to=date(2025, 1, 31)
    )
    assert (start, end) == (date(2025, 1, 1), date(2025, 1, 31))


def test_resolve_period_range_daily_defaults_to_today():
    start, end = services.resolve_period_range(period="daily")
    assert (start, end) == (TODAY, TODAY)


def test_resolve_period_range_weekly_defaults_to_monday_through_sunday():
    start, end = services.resolve_period_range(period="weekly")
    assert start.weekday() == 0
    assert end.weekday() == 6
    assert start <= TODAY <= end


def test_resolve_period_range_monthly_defaults_to_full_calendar_month():
    start, end = services.resolve_period_range(period="monthly")
    assert start == TODAY.replace(day=1)
    assert start.month == end.month
    assert end.day >= 28


@override_settings(FISCAL_YEAR_START_MONTH=7, FISCAL_YEAR_START_DAY=1)
def test_resolve_period_range_yearly_follows_fiscal_calendar_after_boundary():
    """Document 02 Sec 5's example boundary (Hamle 1, ~Gregorian July 1):
    a date on/after July 1 falls in the fiscal year starting that July 1
    and ending June 30 the following year."""
    start, end = services._fiscal_year_bounds(on_date=date(2026, 8, 30))
    assert (start, end) == (date(2026, 7, 1), date(2027, 6, 30))


@override_settings(FISCAL_YEAR_START_MONTH=7, FISCAL_YEAR_START_DAY=1)
def test_resolve_period_range_yearly_follows_fiscal_calendar_before_boundary():
    start, end = services._fiscal_year_bounds(on_date=date(2026, 3, 15))
    assert (start, end) == (date(2025, 7, 1), date(2026, 6, 30))


# --------------------------------------------------------------------------
# get_report_summary
# --------------------------------------------------------------------------


def test_report_summary_scopes_to_visit_date_not_created_at():
    category = _make_category(price=Decimal("100.00"))
    in_range = _make_booking(
        category=category, status=Booking.Status.VISITED, visit_date=TODAY
    )
    _make_completed_payment(booking=in_range)
    out_of_range = _make_booking(
        category=category,
        status=Booking.Status.VISITED,
        visit_date=TODAY - timedelta(days=10),
    )
    _make_completed_payment(booking=out_of_range)

    summary = services.get_report_summary(period="daily")
    assert summary["revenue_by_category"] == {"Adult": Decimal("100.00")}


def test_report_summary_revenue_by_category_nets_refunds_per_category():
    adult = _make_category(name_en="Adult", price=Decimal("100.00"))
    student = _make_category(name_en="Student", price=Decimal("50.00"))

    adult_booking = _make_booking(category=adult, status=Booking.Status.VISITED)
    adult_payment = _make_completed_payment(booking=adult_booking)
    _make_completed_refund(
        booking=adult_booking, payment=adult_payment, amount=Decimal("20.00")
    )

    student_booking = _make_booking(category=student, status=Booking.Status.VISITED)
    _make_completed_payment(booking=student_booking)

    summary = services.get_report_summary(period="daily")
    assert summary["revenue_by_category"] == {
        "Adult": Decimal("80.00"),
        "Student": Decimal("50.00"),
    }


def test_report_summary_visitor_counts_by_group_buckets_individuals_together():
    category = _make_category()
    _make_booking(
        category=category,
        status=Booking.Status.VISITED,
        booking_type=Booking.BookingType.GROUP,
        group_name="Addis Ababa Elementary",
        booked_quantity=25,
    )
    _make_booking(
        category=category,
        status=Booking.Status.VISITED,
        booking_type=Booking.BookingType.GROUP,
        group_name="Bole Secondary",
        booked_quantity=10,
    )
    _make_booking(
        category=category,
        status=Booking.Status.PENDING,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=1,
    )
    _make_booking(
        category=category,
        status=Booking.Status.PENDING,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=2,
    )

    summary = services.get_report_summary(period="daily")
    assert summary["visitor_counts_by_group"] == {
        "Addis Ababa Elementary": 25,
        "Bole Secondary": 10,
        "Individual": 3,
    }


def test_report_summary_echoes_period_and_resolved_range():
    summary = services.get_report_summary(
        period="monthly", date_from=date(2025, 1, 1), date_to=date(2025, 1, 31)
    )
    assert summary["period"] == "monthly"
    assert summary["from"] == date(2025, 1, 1)
    assert summary["to"] == date(2025, 1, 31)
    assert summary["revenue_by_category"] == {}
    assert summary["visitor_counts_by_group"] == {}
