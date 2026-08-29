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
from apps.bookings.models import Booking
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
    return Booking.objects.create(
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

    response = client.post(
        f"/api/v1/bookings/{booking.id}/check-in/", {"attendedQuantity": 20}, format="json"
    )

    assert response.status_code == 401


def test_check_in_rejects_visitor():
    booking = _make_pending_booking()
    visitor = _make_visitor_account(email="other-visitor@example.com")
    client = _authed_client(visitor)

    response = client.post(
        f"/api/v1/bookings/{booking.id}/check-in/", {"attendedQuantity": 20}, format="json"
    )

    assert response.status_code == 403


def test_check_in_succeeds_for_cashier():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(
        f"/api/v1/bookings/{booking.id}/check-in/", {"attendedQuantity": 15}, format="json"
    )

    assert response.status_code == 200
    assert response.data["status"] == "visited"
    assert response.data["attendedQuantity"] == 15


def test_check_in_excess_attendance_is_bad_request():
    booking = _make_pending_booking(quantity=20)
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(
        f"/api/v1/bookings/{booking.id}/check-in/", {"attendedQuantity": 21}, format="json"
    )

    assert response.status_code == 400


def test_check_in_non_pending_booking_conflicts():
    booking = _make_pending_booking(quantity=20)
    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status"])
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(
        f"/api/v1/bookings/{booking.id}/check-in/", {"attendedQuantity": 20}, format="json"
    )

    assert response.status_code == 409


def test_check_in_unknown_booking_returns_404():
    cashier = _make_account(Account.Role.CASHIER)
    client = _authed_client(cashier)

    response = client.post(
        "/api/v1/bookings/00000000-0000-0000-0000-000000000000/check-in/",
        {"attendedQuantity": 1},
        format="json",
    )

    assert response.status_code == 404
