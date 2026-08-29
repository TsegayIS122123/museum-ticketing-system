"""
HTTP-level tests for permission/ownership boundaries and endpoint wiring
(Design Spec Sec 3.1: services.py, exercised in test_services.py, assumes
the caller is already authorized -- this module is what actually proves
that boundary from the outside).
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import AccountRefreshToken
from apps.accounts.models import Account
from apps.bookings.models import Booking
from apps.catalog.models import Category

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)


@pytest.fixture(autouse=True)
def _mock_chapa_checkout():
    """Every individual booking created here (and every approved group
    booking) now triggers apps.payments.services.create_checkout_session,
    which calls out to Chapa (see BookingListCreateView.post/
    BookingApprovalView.put). This module tests bookings' own
    permission/ownership/wiring boundary (module docstring), not Chapa
    integration -- that's apps/payments/tests' job -- so the one function
    that actually makes the HTTP call is mocked here, autouse, for every
    test in this file."""
    with mock.patch(
        "apps.payments.services._initialize_chapa_checkout",
        return_value="https://checkout.chapa.co/checkout/test-session",
    ) as mocked:
        yield mocked


def _make_staff(role, email="staff@example.com"):
    account = Account(email=email, full_name="Staff Person", role=role)
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_visitor(email="visitor@example.com", verified=True):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    if verified:
        account.email_verified_at = timezone.now()
        account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_category(name_en="Student", price_etb="50.00"):
    return Category.objects.create(name_en=name_en, name_am=name_en, price_etb=Decimal(price_etb))


def _authed_client(account):
    client = APIClient()
    refresh = AccountRefreshToken.for_user(account)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def _create_booking_payload(category, booking_type="individual", **overrides):
    payload = {
        "visitDate": TOMORROW.isoformat(),
        "categoryId": str(category.id),
        "quantity": 1,
        "bookingType": booking_type,
    }
    payload.update(overrides)
    return payload


# --------------------------------------------------------------------------
# GET /availability -- public
# --------------------------------------------------------------------------


def test_list_availability_is_public():
    response = APIClient().get(
        f"/api/v1/availability/?from={TOMORROW.isoformat()}&to={TOMORROW.isoformat()}"
    )

    assert response.status_code == 200
    assert response.data[0]["isOpenForBooking"] is True


def test_list_availability_requires_from_and_to():
    response = APIClient().get("/api/v1/availability/")

    assert response.status_code == 400


# --------------------------------------------------------------------------
# PUT /availability/{date} -- Museum Manager only
# --------------------------------------------------------------------------


def test_set_availability_rejected_for_non_manager():
    client = _authed_client(_make_visitor())

    response = client.put(
        f"/api/v1/availability/{TOMORROW.isoformat()}/",
        {"isOpenForBooking": False},
        format="json",
    )

    assert response.status_code == 403


def test_set_availability_allowed_for_museum_manager():
    client = _authed_client(_make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com"))

    response = client.put(
        f"/api/v1/availability/{TOMORROW.isoformat()}/",
        {"isOpenForBooking": False},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["isOpenForBooking"] is False


# --------------------------------------------------------------------------
# POST /bookings -- Visitor only (FR-BOOK-001/003)
# --------------------------------------------------------------------------


def test_create_booking_rejected_for_anonymous():
    category = _make_category()

    response = APIClient().post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    )

    assert response.status_code == 401


def test_create_booking_rejected_for_staff():
    category = _make_category()
    client = _authed_client(_make_staff(Account.Role.CASHIER))

    response = client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    )

    assert response.status_code == 403


def test_create_individual_booking_allowed_for_visitor():
    category = _make_category()
    client = _authed_client(_make_visitor())

    response = client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    )

    assert response.status_code == 201
    assert response.data["status"] == "awaiting_payment"
    assert response.data["reference"]
    assert response.data["checkoutUrl"]


def test_create_group_booking_requires_group_name():
    category = _make_category()
    client = _authed_client(_make_visitor())

    response = client.post(
        "/api/v1/bookings/",
        _create_booking_payload(category, booking_type="group", quantity=20),
        format="json",
    )

    assert response.status_code == 400


# --------------------------------------------------------------------------
# GET /bookings -- Staff only
# --------------------------------------------------------------------------


def test_list_bookings_rejected_for_visitor():
    client = _authed_client(_make_visitor())

    response = client.get("/api/v1/bookings/")

    assert response.status_code == 403


def test_list_bookings_allowed_for_staff():
    category = _make_category()
    visitor = _make_visitor()
    client = _authed_client(visitor)
    client.post("/api/v1/bookings/", _create_booking_payload(category), format="json")

    staff_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))
    response = staff_client.get("/api/v1/bookings/")

    assert response.status_code == 200
    assert response.data["meta"]["total"] == 1


# --------------------------------------------------------------------------
# GET /bookings/{id} -- owner Visitor or any Staff
# --------------------------------------------------------------------------


def test_get_booking_allowed_for_owner():
    category = _make_category()
    visitor = _make_visitor()
    client = _authed_client(visitor)
    created = client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data

    response = client.get(f"/api/v1/bookings/{created['id']}/")

    assert response.status_code == 200


def test_get_booking_rejected_for_a_different_visitor():
    category = _make_category()
    owner_client = _authed_client(_make_visitor())
    created = owner_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data

    other_client = _authed_client(_make_visitor(email="other@example.com"))
    response = other_client.get(f"/api/v1/bookings/{created['id']}/")

    assert response.status_code == 403


def test_get_booking_allowed_for_staff():
    category = _make_category()
    owner_client = _authed_client(_make_visitor())
    created = owner_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data

    staff_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))
    response = staff_client.get(f"/api/v1/bookings/{created['id']}/")

    assert response.status_code == 200


# --------------------------------------------------------------------------
# PUT /bookings/{id}/approval -- Museum Manager only (FR-BOOK-003)
# --------------------------------------------------------------------------


def test_approval_rejected_for_non_manager():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/",
        _create_booking_payload(category, booking_type="group", quantity=20, groupName="A School"),
        format="json",
    ).data

    response = visitor_client.put(
        f"/api/v1/bookings/{created['id']}/approval/", {"decision": "approve"}, format="json"
    )

    assert response.status_code == 403


def test_approval_allowed_for_museum_manager():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/",
        _create_booking_payload(category, booking_type="group", quantity=20, groupName="A School"),
        format="json",
    ).data

    manager_client = _authed_client(
        _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    )
    response = manager_client.put(
        f"/api/v1/bookings/{created['id']}/approval/", {"decision": "approve"}, format="json"
    )

    assert response.status_code == 200
    assert response.data["status"] == "awaiting_payment"
    assert response.data["approvalStatus"] == "approved"
    assert response.data["checkoutUrl"]


# --------------------------------------------------------------------------
# POST /bookings/{id}/cancel -- FR-BOOK-005
# --------------------------------------------------------------------------


def test_cancel_rejected_while_awaiting_payment():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data

    response = visitor_client.post(f"/api/v1/bookings/{created['id']}/cancel/")

    assert response.status_code == 409


def test_cancel_succeeds_once_pending():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data
    booking = Booking.objects.get(id=created["id"])
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])

    response = visitor_client.post(f"/api/v1/bookings/{created['id']}/cancel/")

    assert response.status_code == 200
    assert response.data["status"] == "cancelled"


# --------------------------------------------------------------------------
# POST /bookings/{id}/reschedule -- FR-BOOK-007
# --------------------------------------------------------------------------


def test_reschedule_succeeds_once_pending():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data
    booking = Booking.objects.get(id=created["id"])
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])
    new_date = TOMORROW + timedelta(days=3)

    response = visitor_client.post(
        f"/api/v1/bookings/{created['id']}/reschedule/",
        {"newVisitDate": new_date.isoformat()},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["visitDate"] == new_date.isoformat()


# --------------------------------------------------------------------------
# GET /users/me/bookings -- FR-ACC-004
# --------------------------------------------------------------------------


def test_my_bookings_only_returns_own_and_rejects_staff():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    visitor_client.post("/api/v1/bookings/", _create_booking_payload(category), format="json")

    response = visitor_client.get("/api/v1/users/me/bookings/")
    assert response.status_code == 200
    assert response.data["meta"]["total"] == 1

    staff_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))
    staff_response = staff_client.get("/api/v1/users/me/bookings/")
    assert staff_response.status_code == 403
