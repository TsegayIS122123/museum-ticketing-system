"""
Phase 7a (UAT round 1): the reported bug was "a visitor is checked in at
the gate today and the Manager's Today's Revenue stays at 0". Every
existing test in `test_services.py` builds its booking/payment fixtures
directly via the ORM (`_make_booking`/`_make_completed_payment`) --
correct for isolating `reporting/services.py`'s own query logic, but it
means none of them actually exercise the real
`bookings.create_booking -> payments.create_checkout_session ->
payments.confirm_payment_from_webhook -> entrance.check_in_booking ->
reporting.get_report_summary` pipeline the real UAT scenario goes
through. This file is that missing end-to-end test -- the "write a
failing test that reproduces the real UAT scenario" the build prompt
asked for.

Diagnosis (checked each suspected cause against the current code before
writing this, rather than guessing):

1. Walk-up/cash payment path -- doesn't exist in this codebase. Every
   payment is Chapa; `Booking.status` is only ever set to `Pending` in
   one place (`payments.services.confirm_payment_from_webhook`), so a
   `Visited` booking reached through the normal flow always has a
   `Payment(COMPLETED)` behind it.
2. UTC vs Africa/Addis_Ababa timezone boundary --
   `reporting.services.resolve_period_range` already uses
   `timezone.localdate()`, not `date.today()` (that function's own
   docstring documents this as a prior fix, commit `b3237e1`).
3. `revenueByCategory` values summed as strings in the frontend --
   `frontend/.../staff/dashboard/page.tsx`'s `revenueToday` already does
   `parseFloat(amount)` in its reduce.

All three suspected causes are already fixed. This test passes against
the current code -- it did NOT reproduce the reported symptom. Keeping
it as a permanent regression test for exactly this pipeline, since it's
a real coverage gap (a webhook-driven cross-app flow) regardless of
whether today's bug is still live somewhere this test doesn't reach
(e.g. a UAT/staging environment where the Chapa webhook was never
actually delivered -- an infrastructure/configuration question, not
something a unit test can diagnose).
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone

from apps.accounts.models import Account
from apps.bookings import services as booking_services
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.entrance import services as entrance_services
from apps.payments import services as payment_services
from apps.reporting import services as reporting_services

pytestmark = pytest.mark.django_db

FAKE_CHECKOUT_URL = "https://checkout.chapa.co/checkout/test-session"


def _next_non_sunday(start):
    """See the identical helper in apps.bookings.tests.test_services --
    Sunday is unconditionally closed (UAT round 1)."""
    current = start
    while current.weekday() == 6:
        current += timedelta(days=1)
    return current


def _make_visitor(email="visitor@example.com"):
    account = Account(
        email=email, phone="+251911000000", full_name="Hana Bekele", role=Account.Role.VISITOR
    )
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


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_gate_check_in_today_shows_up_in_todays_revenue(mock_init):
    """The real UAT scenario, end to end: book -> pay (webhook-confirmed,
    same as Chapa would actually call back) -> check in at the gate,
    all today -- then read the Manager's dashboard the same way the
    frontend does (GET /reports/summary?period=daily)."""
    today = timezone.localdate()
    visit_date = _next_non_sunday(today)
    if visit_date != today:
        pytest.skip("today is a Sunday in this test environment; the museum is closed")

    visitor = _make_visitor()
    category = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=Decimal("100.00")
    )
    cashier = _make_cashier()

    booking = booking_services.create_booking(
        visitor=visitor,
        items=[{"category_id": category.id, "quantity": 2}],
        visit_date=visit_date,
        booking_type=Booking.BookingType.INDIVIDUAL,
    )
    assert booking.status == Booking.Status.AWAITING_PAYMENT

    payment = payment_services.create_checkout_session(booking=booking)
    mock_init.assert_called_once()

    payment_services.confirm_payment_from_webhook(
        payload={"tx_ref": payment.tx_ref, "status": "success"}
    )
    booking.refresh_from_db()
    assert booking.status == Booking.Status.PENDING

    entrance_services.check_in_booking(booking=booking, actor=cashier)
    booking.refresh_from_db()
    assert booking.status == Booking.Status.VISITED

    summary = reporting_services.get_report_summary(period="daily")

    assert summary["from"] == today
    assert summary["to"] == today
    total_revenue = sum(summary["revenue_by_category"].values())
    assert total_revenue == Decimal("200.00")
    assert summary["revenue_by_category"]["Adult"] == Decimal("200.00")

    dashboard = reporting_services.get_dashboard()
    assert dashboard["revenue_total_etb"] >= Decimal("200.00")


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_gate_check_in_group_booking_revenue_by_category(mock_init):
    """Same pipeline, a mixed-category group booking -- confirms
    `_net_revenue_by_category`'s per-item proportional split (not just
    the single-category case above) also survives the full webhook-driven
    flow, not just the direct-ORM fixtures `test_services.py` uses."""
    today = timezone.localdate()
    visit_date = _next_non_sunday(today)
    if visit_date != today:
        pytest.skip("today is a Sunday in this test environment; the museum is closed")

    visitor = _make_visitor()
    adult = Category.objects.create(name_en="Adult", name_am="Adult", price_etb=Decimal("100.00"))
    student = Category.objects.create(
        name_en="Student", name_am="Student", price_etb=Decimal("30.00")
    )
    cashier = _make_cashier()

    booking = booking_services.create_booking(
        visitor=visitor,
        items=[
            {"category_id": adult.id, "quantity": 1},
            {"category_id": student.id, "quantity": 3},
        ],
        visit_date=visit_date,
        booking_type=Booking.BookingType.GROUP,
        group_name="Example Primary School",
        group_tin="0000900158",
    )
    payment = payment_services.create_checkout_session(booking=booking)
    payment_services.confirm_payment_from_webhook(
        payload={"tx_ref": payment.tx_ref, "status": "success"}
    )
    booking.refresh_from_db()
    entrance_services.check_in_booking(booking=booking, actor=cashier)

    summary = reporting_services.get_report_summary(period="daily")

    assert summary["revenue_by_category"]["Adult"] == Decimal("100.00")
    assert summary["revenue_by_category"]["Student"] == Decimal("90.00")
