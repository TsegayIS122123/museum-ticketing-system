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
from apps.payments.models import Payment
from apps.refunds.models import Refund

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)


@pytest.fixture(autouse=True)
def _mock_chapa_checkout():
    """Every booking created here, individual or group alike, now
    triggers apps.payments.services.create_checkout_session, which calls
    out to Chapa (see BookingListCreateView.post). This module tests
    bookings' own permission/ownership/wiring boundary (module
    docstring), not Chapa integration -- that's apps/payments/tests' job
    -- so the one function that actually makes the HTTP call is mocked
    here, autouse, for every test in this file."""
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


def _create_booking_payload(category, booking_type="individual", quantity=1, **overrides):
    payload = {
        "visitDate": TOMORROW.isoformat(),
        "items": [{"categoryId": str(category.id), "quantity": quantity}],
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
        _create_booking_payload(category, booking_type="group", quantity=20, groupTin="0000900158"),
        format="json",
    )

    assert response.status_code == 400


def test_create_group_booking_requires_group_tin():
    category = _make_category()
    client = _authed_client(_make_visitor())

    response = client.post(
        "/api/v1/bookings/",
        _create_booking_payload(category, booking_type="group", quantity=20, groupName="A School"),
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
# POST /bookings -- a group booking has no approval gate (FR-BOOK-003)
# --------------------------------------------------------------------------


def test_group_booking_goes_straight_to_awaiting_payment():
    """There is no PUT /bookings/{id}/approval endpoint any more -- a
    group booking is created exactly like an individual one, with
    DateAvailability (FR-BOOK-008) as the only capacity control."""
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/",
        _create_booking_payload(
            category, booking_type="group", quantity=20, groupName="A School", groupTin="0000900158"
        ),
        format="json",
    ).data

    assert created["status"] == "awaiting_payment"
    assert created["checkoutUrl"]
    assert created["groupTin"] == "0000900158"

    response = visitor_client.put(
        f"/api/v1/bookings/{created['id']}/approval/", {"decision": "approve"}, format="json"
    )

    assert response.status_code == 404


# --------------------------------------------------------------------------
# POST /bookings/{id}/cancel -- FR-BOOK-005
# --------------------------------------------------------------------------


def test_cancel_of_awaiting_payment_booking_succeeds_without_a_refund():
    """`BookingCancelView` deliberately also accepts a still-unpaid
    `AwaitingPayment` booking -- the delete half of a Visitor's own
    pre-payment editing capability (see the view's own docstring and
    `services.cancel_awaiting_payment_booking`). This used to assert the
    opposite (409) from before that capability existed; updated here to
    match the endpoint's actual, intentional contract instead of a stale
    expectation. No `Refund` is created either way: nothing was ever
    collected for a booking that never left `AwaitingPayment`.
    """
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data

    response = visitor_client.post(f"/api/v1/bookings/{created['id']}/cancel/")

    assert response.status_code == 200
    assert response.data["status"] == "cancelled"
    assert not Refund.objects.filter(booking_id=created["id"]).exists()


def test_cancel_of_awaiting_payment_booking_rejected_for_a_different_visitor():
    category = _make_category()
    owner_client = _authed_client(_make_visitor())
    created = owner_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data

    someone_else_client = _authed_client(_make_visitor(email="someone-else@example.com"))
    response = someone_else_client.post(f"/api/v1/bookings/{created['id']}/cancel/")

    assert response.status_code == 403


def test_cancel_succeeds_once_pending():
    category = _make_category()
    visitor_client = _authed_client(_make_visitor())
    created = visitor_client.post(
        "/api/v1/bookings/", _create_booking_payload(category), format="json"
    ).data
    booking = Booking.objects.get(id=created["id"])
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])
    # Cancelling triggers refunds.services.trigger_cancellation_refund,
    # which requires a completed Payment -- a real Pending booking can
    # only exist because confirm_payment_from_webhook already completed
    # one, so fake that here too rather than just the booking status.
    Payment.objects.create(
        booking=booking,
        tx_ref=f"museum-{booking.id.hex}-test",
        amount_etb=booking.total_amount_etb,
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )

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
# PATCH /bookings/{id}/category-correction -- ID-verification addendum
# --------------------------------------------------------------------------


def _make_pending_booking_via_api(client, category, quantity=1):
    created = client.post(
        "/api/v1/bookings/",
        _create_booking_payload(category, quantity=quantity),
        format="json",
    ).data
    booking = Booking.objects.get(id=created["id"])
    booking.status = Booking.Status.PENDING
    booking.save(update_fields=["status"])
    Payment.objects.create(
        booking=booking,
        tx_ref=f"museum-{booking.id.hex}-test",
        amount_etb=booking.total_amount_etb,
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )
    return booking


def test_category_correction_rejected_for_non_cashier():
    student = _make_category(name_en="Student", price_etb="50.00")
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student)
    item = booking.items.get()
    manager_client = _authed_client(
        _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    )

    response = manager_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "categoryId": str(non_resident.id)},
        format="json",
    )

    assert response.status_code == 403


def test_category_correction_undercharge_reopens_payment():
    student = _make_category(name_en="Student", price_etb="50.00")
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student)
    item = booking.items.get()
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "categoryId": str(non_resident.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "awaiting_payment"
    assert response.data["totalAmountEtb"] == "500.00"
    assert response.data["checkoutUrl"]
    assert response.data["categoryCorrectedAt"]
    # The check-in gate reuses the existing Pending-only guard -- this
    # booking cannot be checked in again until the top-up is paid.
    booking.refresh_from_db()
    assert booking.status == Booking.Status.AWAITING_PAYMENT


def test_category_correction_overcharge_issues_refund_and_stays_pending():
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    student = _make_category(name_en="Student", price_etb="50.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, non_resident)
    item = booking.items.get()
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "categoryId": str(student.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "pending"
    assert response.data["totalAmountEtb"] == "50.00"
    from apps.refunds.models import Refund

    refund = Refund.objects.get(booking=booking)
    assert refund.reason == Refund.Reason.CATEGORY_CORRECTION
    assert refund.amount_etb == Decimal("450.00")


def test_category_correction_rejected_once_no_longer_pending():
    student = _make_category(name_en="Student", price_etb="50.00")
    non_resident = _make_category(name_en="Non-Resident", price_etb="500.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student)
    item = booking.items.get()
    booking.status = Booking.Status.VISITED
    booking.save(update_fields=["status"])
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "categoryId": str(non_resident.id)},
        format="json",
    )

    assert response.status_code == 409


# --------------------------------------------------------------------------
# PATCH /bookings/{id}/category-correction -- quantity correction
# --------------------------------------------------------------------------


def test_quantity_correction_undercharge_reopens_payment():
    student = _make_category(name_en="Student", price_etb="50.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student, quantity=2)
    item = booking.items.get()
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "quantity": 3},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "awaiting_payment"
    assert response.data["totalAmountEtb"] == "150.00"
    assert response.data["bookedQuantity"] == 3
    assert response.data["checkoutUrl"]
    assert response.data["categoryCorrectedAt"]
    booking.refresh_from_db()
    assert booking.status == Booking.Status.AWAITING_PAYMENT


def test_quantity_correction_overcharge_issues_refund_and_stays_pending():
    student = _make_category(name_en="Student", price_etb="50.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student, quantity=3)
    item = booking.items.get()
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "quantity": 2},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "pending"
    assert response.data["totalAmountEtb"] == "100.00"
    assert response.data["bookedQuantity"] == 2
    from apps.refunds.models import Refund

    refund = Refund.objects.get(booking=booking)
    assert refund.reason == Refund.Reason.CATEGORY_CORRECTION
    assert refund.amount_etb == Decimal("50.00")


def test_quantity_and_category_correction_together_in_one_request():
    student = _make_category(name_en="Student", price_etb="50.00")
    adult = _make_category(name_en="Adult", price_etb="100.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student, quantity=3)
    item = booking.items.get()
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    # old: 3 x 50 = 150.00; new: 1 x 100 = 100.00 -> overcharge, refund 50
    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id), "categoryId": str(adult.id), "quantity": 1},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "pending"
    assert response.data["totalAmountEtb"] == "100.00"
    assert response.data["bookedQuantity"] == 1
    from apps.refunds.models import Refund

    refund = Refund.objects.get(booking=booking)
    assert refund.amount_etb == Decimal("50.00")


def test_quantity_correction_rejects_missing_category_and_quantity():
    student = _make_category(name_en="Student", price_etb="50.00")
    visitor_client = _authed_client(_make_visitor())
    booking = _make_pending_booking_via_api(visitor_client, student, quantity=2)
    item = booking.items.get()
    cashier_client = _authed_client(_make_staff(Account.Role.CASHIER, email="cashier@example.com"))

    response = cashier_client.patch(
        f"/api/v1/bookings/{booking.id}/category-correction/",
        {"itemId": str(item.id)},
        format="json",
    )

    assert response.status_code == 400


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
