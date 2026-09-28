"""
HTTP-level tests for the Cashier-only permission boundary and endpoint
wiring (Design Spec Sec 3.1: services.py, exercised in test_services.py,
assumes the caller is already authorized -- this module is what actually
proves that boundary from the outside).
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import AccountRefreshToken
from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem
from apps.catalog.models import Category

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)


def _make_account(role, email="staff@example.com"):
    account = Account(email=email, full_name="Staff Person", role=role)
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_visitor_account(email="visitor@example.com"):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _authed_client(account):
    client = APIClient()
    refresh = AccountRefreshToken.for_user(account)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def _make_pending_booking(quantity=20):
    visitor = _make_visitor_account()
    category = Category.objects.create(name_en="Student", name_am="Student", price_etb=Decimal("50.00"))
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
# GET /bookings/lookup
# --------------------------------------------------------------------------


def test_lookup_requires_authentication():
    booking = _make_pending_booking()
    client = APIClient()

    response = client.get("/api/v1/bookings/lookup/", {"reference": booking.reference})

    assert response.status_code == 401


@pytest.mark.parametrize(
    "role", [Account.Role.VISITOR, Account.Role.MUSEUM_MANAGER, Account.Role.PLATFORM_ADMIN]
)
def test_lookup_rejects_non_cashier_roles(role):
    booking = _make_pending_booking()
    account = (
        _make_visitor_account(email="v@example.com")
        if role == Account.Role.VISITOR
        else _make_account(role, email="other@example.com")
    )
    client = _authed_client(account)

    response = client.get("/api/v1/bookings/lookup/", {"reference": booking.reference})

    assert response.status_code == 403


def test_lookup_succeeds_for_cashier():
    booking = _make_pending_booking()
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.get("/api/v1/bookings/lookup/", {"reference": booking.reference})

    assert response.status_code == 200
    assert response.data["id"] == str(booking.id)


def test_lookup_unknown_reference_returns_404():
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.get("/api/v1/bookings/lookup/", {"reference": "ZZZZZZZZ"})

    assert response.status_code == 404


# --------------------------------------------------------------------------
# POST /bookings/{id}/check-in
# --------------------------------------------------------------------------


def test_check_in_requires_authentication():
    booking = _make_pending_booking()
    client = APIClient()

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 401


def test_check_in_rejects_visitor():
    booking = _make_pending_booking()
    visitor = _make_visitor_account(email="other-visitor@example.com")
    client = _authed_client(visitor)

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 403


def test_check_in_succeeds_for_cashier():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 200
    assert response.data["status"] == "visited"
    assert response.data["attendedQuantity"] == 20


def test_check_in_group_booking_receivedFrom_falls_back_to_group_snapshot():
    """A group booking with no linked `institution` (legacy, or -- as
    here -- mutated directly via the ORM rather than through
    `create_booking`) still gets a usable voucher, via the `group_name`/
    `group_tin` fallback (see `_resolve_received_from`'s own
    docstring)."""
    booking = _make_pending_booking(quantity=25)
    booking.booking_type = Booking.BookingType.GROUP
    booking.group_name = "BS School Group"
    booking.group_tin = "0000900158"
    booking.save(update_fields=["booking_type", "group_name", "group_tin"])
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 200
    assert response.data["voucher"]["receivedFrom"] == "BS School Group Tin 0000900158"


def test_check_in_individual_booking_receivedFrom_is_visitor_name():
    booking = _make_pending_booking(quantity=1)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 200
    assert response.data["voucher"]["receivedFrom"] == booking.visitor.full_name


def test_check_in_non_pending_booking_conflicts():
    booking = _make_pending_booking(quantity=20)
    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status"])
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 409


def test_check_in_a_flagged_booking_conflicts():
    """UAT round 1: an open mismatch flag blocks check-in outright, even
    while the booking is still Pending."""
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)
    client.post(f"/api/v1/bookings/{booking.id}/flag-mismatch/", {}, format="json")

    response = client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    assert response.status_code == 409


def test_check_in_unknown_booking_returns_404():
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(
        "/api/v1/bookings/00000000-0000-0000-0000-000000000000/check-in/"
    )

    assert response.status_code == 404


# --------------------------------------------------------------------------
# POST /bookings/{id}/flag-mismatch/ (UAT round 1)
# --------------------------------------------------------------------------


def test_flag_mismatch_requires_authentication():
    booking = _make_pending_booking()
    client = APIClient()

    response = client.post(f"/api/v1/bookings/{booking.id}/flag-mismatch/", {}, format="json")

    assert response.status_code == 401


def test_flag_mismatch_rejects_visitor():
    booking = _make_pending_booking()
    visitor = _make_visitor_account(email="other-visitor@example.com")
    client = _authed_client(visitor)

    response = client.post(f"/api/v1/bookings/{booking.id}/flag-mismatch/", {}, format="json")

    assert response.status_code == 403


def test_flag_mismatch_rejects_museum_manager():
    """Flagging is the Cashier's job -- the Manager's job starts on the
    other side of the queue (correcting), not here."""
    booking = _make_pending_booking()
    manager = _make_account(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    client = _authed_client(manager)

    response = client.post(f"/api/v1/bookings/{booking.id}/flag-mismatch/", {}, format="json")

    assert response.status_code == 403


def test_flag_mismatch_succeeds_for_cashier():
    booking = _make_pending_booking()
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(
        f"/api/v1/bookings/{booking.id}/flag-mismatch/",
        {"note": "only 18 showed"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "pending"
    assert response.data["flaggedMismatchAt"] is not None
    assert response.data["flaggedMismatchNote"] == "only 18 showed"


def test_flag_mismatch_note_is_optional():
    booking = _make_pending_booking()
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(f"/api/v1/bookings/{booking.id}/flag-mismatch/", {}, format="json")

    assert response.status_code == 200
    assert response.data["flaggedMismatchNote"] is None


def test_flag_mismatch_non_pending_booking_conflicts():
    booking = _make_pending_booking()
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status"])
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(f"/api/v1/bookings/{booking.id}/flag-mismatch/", {}, format="json")

    assert response.status_code == 409


# --------------------------------------------------------------------------
# GET/PATCH /bookings/{id}/ifmis-voucher/ (Phase 6, UAT round 1)
# --------------------------------------------------------------------------


def test_get_voucher_before_check_in_has_no_document_or_ref_no():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.get(f"/api/v1/bookings/{booking.id}/ifmis-voucher/")

    assert response.status_code == 200
    assert response.data["documentNo"] is None
    assert response.data["refNo"] is None
    assert response.data["voucherRecorded"] is False
    assert response.data["date"] is None


def test_get_voucher_after_check_in_shows_date_and_purpose():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)
    client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    response = client.get(f"/api/v1/bookings/{booking.id}/ifmis-voucher/")

    assert response.status_code == 200
    assert response.data["date"] is not None
    assert response.data["purpose"].startswith("To visit")
    assert response.data["amountFigures"].startswith("ETB ")


def test_patch_voucher_requires_both_document_no_and_ref_no():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)
    client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    response = client.patch(
        f"/api/v1/bookings/{booking.id}/ifmis-voucher/",
        {"documentNo": "0001082"},
        format="json",
    )

    assert response.status_code == 400


def test_patch_voucher_succeeds_with_both_identifiers():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)
    client.post(f"/api/v1/bookings/{booking.id}/check-in/")

    response = client.patch(
        f"/api/v1/bookings/{booking.id}/ifmis-voucher/",
        {"documentNo": "0001082", "refNo": "be395"},
        format="json",
    )

    assert response.status_code == 200
    voucher_response = client.get(f"/api/v1/bookings/{booking.id}/ifmis-voucher/")
    assert voucher_response.data["documentNo"] == "0001082"
    assert voucher_response.data["refNo"] == "be395"
    assert voucher_response.data["voucherRecorded"] is True


def test_patch_voucher_rejects_a_different_cashier():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER, email="cashier1@example.com")
    other_cashier = _make_account(Account.Role.CASHIER, email="cashier2@example.com")
    client = _authed_client(cashier)
    client.post(f"/api/v1/bookings/{booking.id}/check-in/")
    other_client = _authed_client(other_cashier)

    response = other_client.patch(
        f"/api/v1/bookings/{booking.id}/ifmis-voucher/",
        {"documentNo": "0001082", "refNo": "be395"},
        format="json",
    )

    assert response.status_code == 403


def test_patch_voucher_settable_only_once():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)
    client.post(f"/api/v1/bookings/{booking.id}/check-in/")
    client.patch(
        f"/api/v1/bookings/{booking.id}/ifmis-voucher/",
        {"documentNo": "0001082", "refNo": "be395"},
        format="json",
    )

    response = client.patch(
        f"/api/v1/bookings/{booking.id}/ifmis-voucher/",
        {"documentNo": "9999999", "refNo": "zzzzz"},
        format="json",
    )

    assert response.status_code == 409
