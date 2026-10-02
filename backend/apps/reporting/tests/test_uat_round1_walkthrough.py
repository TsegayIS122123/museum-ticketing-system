"""UAT round 1 end-to-end walk-through (Phase 8).

One school group's whole journey through the real service pipeline, in
the order the museum actually experiences it:

  school books (TIN -> institution registry) -> pays (webhook) ->
  arrives with fewer people -> Cashier cannot check in, flags it ->
  Manager corrects the headcount -> Cashier completes check-in ->
  voucher shows the real sample's shape -> Cashier keys back both IFMIS
  numbers -> Manager's Schools / Attendance / Revenue reports agree.

Also pins the Sunday rule at the very start of the journey.
"""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone

from apps.accounts.models import Account
from apps.bookings import services as booking_services
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.entrance import services as entrance_services
from apps.payments import services as payment_services
from apps.reporting import services as reporting_services

pytestmark = pytest.mark.django_db

FAKE_CHECKOUT_URL = "https://checkout.chapa.co/checkout/test-session"


def _account(email, role, *, visitor=False):
    a = Account(email=email, full_name=email.split("@")[0].title(), role=role)
    if visitor:
        a.phone = f"+2519{abs(hash(email)) % 10**8:08d}"
    if visitor:
        a.set_unusable_password()
        a.email_verified_at = timezone.now()
        a.phone_verified_at = timezone.now()
    else:
        a.set_password("a-strong-password-1")
    a.save()
    return a


def _today_if_open():
    today = timezone.localdate()
    if today.weekday() == 6:
        pytest.skip("today is a Sunday; the museum is closed")
    return today


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_school_group_visit_from_booking_to_manager_report(_mock_init):
    today = _today_if_open()
    teacher = _account("teacher@example.com", Account.Role.VISITOR, visitor=True)
    cashier = _account("cashier@example.com", Account.Role.CASHIER)
    manager = _account("manager@example.com", Account.Role.MUSEUM_MANAGER)
    student = Category.objects.create(name_en="Student", name_am="ተማሪ", price_etb=Decimal("20.00"))

    # 1. School books 20 students, with a TIN -> institution registry.
    booking = booking_services.create_booking(
        visitor=teacher,
        items=[{"category_id": student.id, "quantity": 20}],
        visit_date=today,
        booking_type=Booking.BookingType.GROUP,
        group_name="Menelik II School",
        group_contact_phone="+251911000001",
        group_tin="0000900158",
    )
    assert booking.institution is not None
    assert booking.institution.tin == "0000900158"  # leading zeros preserved

    # 2. Pays (Chapa webhook).
    payment = payment_services.create_checkout_session(booking=booking)
    payment_services.confirm_payment_from_webhook(payload={"tx_ref": payment.tx_ref, "status": "success"})
    booking.refresh_from_db()
    assert booking.status == Booking.Status.PENDING

    # 3. Only 18 arrive. The Cashier cannot fix the count -- she flags it.
    entrance_services.flag_booking_mismatch(booking=booking, actor=cashier, note="only 18 showed")
    booking.refresh_from_db()
    assert booking.flagged_mismatch_at is not None
    with pytest.raises(Conflict):
        entrance_services.check_in_booking(booking=booking, actor=cashier)
    assert reporting_services.get_attendance_report(date_from=today, date_to=today)["currently_flagged_count"] == 1

    # 4. Manager corrects the headcount through the real endpoint. The
    #    school was over-charged for 2 students, so the view issues a refund
    #    for exactly the difference; the flag clears.
    from rest_framework.test import APIClient

    from apps.refunds.models import Refund
    from apps.refunds.tasks import process_refund

    (item,) = booking.items.all()
    client = APIClient()
    client.force_authenticate(manager)
    with mock.patch("apps.refunds.tasks.process_refund.delay"):
        response = client.patch(
            f"/api/v1/bookings/{booking.id}/category-correction/",
            {"itemId": str(item.id), "quantity": 18},
            format="json",
        )
    assert response.status_code == 200, response.content
    booking.refresh_from_db()
    assert booking.flagged_mismatch_at is None
    (refund,) = Refund.objects.filter(booking=booking)
    assert refund.reason == Refund.Reason.CATEGORY_CORRECTION
    assert refund.amount_etb == Decimal("40.00")  # 2 students x 20 ETB

    # Chapa confirms the refund (revenue only counts checked-in bookings, so
    # nothing is reported for this booking until step 5).
    with mock.patch("apps.refunds.services.call_chapa_refund_api", return_value="CHAPA-REF-1"), mock.patch(
        "apps.refunds.services.fetch_chapa_transaction_fee", return_value=Decimal("0.00")
    ):
        process_refund.run(refund_id=str(refund.id))

    # 5. Cashier completes the check-in; voucher has the real sample's shape.
    booking = entrance_services.check_in_booking(booking=booking, actor=cashier)
    assert booking.status == Booking.Status.VISITED
    assert booking.attended_quantity == 18
    voucher = entrance_services.compute_voucher(booking=booking)
    assert voucher["documentNo"] is None and voucher["refNo"] is None  # not keyed in yet
    assert "360" in str(voucher.get("amount", "")) or "360" in str(voucher)

    # 6. She keys the two IFMIS numbers back in.
    entrance_services.record_ifmis_voucher(booking=booking, actor=cashier, document_no="D-1001", ref_no="R-2002")
    voucher = entrance_services.compute_voucher(booking=booking)
    assert (voucher["documentNo"], voucher["refNo"]) == ("D-1001", "R-2002")

    # 7. Manager's reports agree with one another.
    schools = reporting_services.get_institutions_report(date_from=today, date_to=today)
    rows = schools["data"] if isinstance(schools, dict) else schools[0]
    (row,) = rows
    assert row["name"] == "Menelik II School"
    # The Manager's correction rewrote the booking to what actually came
    # (18), so booked == attended here; the original 20 lives in the audit log.
    assert (row["booked_total"], row["attended_total"]) == (18, 18)
    assert row["revenue_etb"] == Decimal("360.00")  # 18 x 20 ETB once the refund completed

    revenue = reporting_services.get_revenue_report(date_from=today, date_to=today)
    assert (Decimal(str(revenue["gross_etb"])), Decimal(str(revenue["refunds_etb"])), Decimal(str(revenue["net_etb"]))) == (
        Decimal("400.00"),
        Decimal("40.00"),
        Decimal("360.00"),
    )
    comparison = reporting_services.get_period_comparison(date_from=today, date_to=today)
    assert comparison["current"]["attended_total"] == 18


def test_sunday_cannot_be_booked():
    today = timezone.localdate()
    sunday = today + timedelta(days=(6 - today.weekday()) % 7 or 7)
    teacher = _account("t2@example.com", Account.Role.VISITOR, visitor=True)
    cat = Category.objects.create(name_en="Adult", name_am="Adult", price_etb=Decimal("50.00"))
    with pytest.raises(Conflict):
        booking_services.create_booking(
            visitor=teacher,
            items=[{"category_id": cat.id, "quantity": 1}],
            visit_date=sunday,
            booking_type=Booking.BookingType.INDIVIDUAL,
        )
