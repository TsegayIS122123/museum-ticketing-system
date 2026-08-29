"""
HTTP-level tests for the Platform-Admin-only permission boundary
(FR-ACC-002) -- a view-layer concern (`core.permissions.IsPlatformAdmin`)
that test_services.py, by design, never exercises (Design Spec Sec 3.1:
services assume the caller has already been authorized). Mirrors
apps.catalog.tests.test_views's own split.
"""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import AccountRefreshToken
from apps.accounts.models import Account

pytestmark = pytest.mark.django_db


def _make_staff(role, email="staff@example.com", password="a-strong-password-1", active=True):
    account = Account(email=email, full_name="Staff Person", role=role, active=active)
    account.set_password(password)
    account.save()
    return account


def _make_admin(email="admin@example.com"):
    return _make_staff(Account.Role.PLATFORM_ADMIN, email=email)


def _make_visitor(email="visitor@example.com"):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    account.save()
    return account


def _authed_client(account):
    client = APIClient()
    refresh = AccountRefreshToken.for_user(account)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# --------------------------------------------------------------------------
# GET /admin/staff -- Platform Admin only
# --------------------------------------------------------------------------


def test_list_staff_rejected_for_anonymous():
    response = APIClient().get("/api/v1/admin/staff/")

    assert response.status_code == 401


def test_list_staff_rejected_for_museum_manager():
    client = _authed_client(_make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com"))

    response = client.get("/api/v1/admin/staff/")

    assert response.status_code == 403


def test_list_staff_rejected_for_visitor():
    client = _authed_client(_make_visitor())

    response = client.get("/api/v1/admin/staff/")

    assert response.status_code == 403


def test_list_staff_allowed_for_platform_admin():
    admin = _make_admin()
    _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    client = _authed_client(admin)

    response = client.get("/api/v1/admin/staff/")

    assert response.status_code == 200
    assert response.data["meta"]["total"] == 2  # the admin itself + the cashier


# --------------------------------------------------------------------------
# POST /admin/staff -- Platform Admin only (FR-ACC-002)
# --------------------------------------------------------------------------


def test_create_staff_rejected_for_cashier():
    client = _authed_client(_make_staff(Account.Role.CASHIER))

    response = client.post(
        "/api/v1/admin/staff/",
        {"email": "new@example.com", "full_name": "New Person", "role": "cashier"},
        format="json",
    )

    assert response.status_code == 403


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_allowed_for_platform_admin(mock_reset):
    client = _authed_client(_make_admin())

    response = client.post(
        "/api/v1/admin/staff/",
        {"email": "new-cashier@example.com", "full_name": "New Cashier", "role": "cashier"},
        format="json",
    )

    assert response.status_code == 201
    assert Account.objects.filter(email="new-cashier@example.com", role="cashier").exists()


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_rejects_visitor_role(mock_reset):
    client = _authed_client(_make_admin())

    response = client.post(
        "/api/v1/admin/staff/",
        {"email": "new@example.com", "full_name": "New Person", "role": "visitor"},
        format="json",
    )

    assert response.status_code == 400


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_conflict_on_duplicate_email(mock_reset):
    _make_staff(Account.Role.CASHIER, email="taken@example.com")
    client = _authed_client(_make_admin())

    response = client.post(
        "/api/v1/admin/staff/",
        {"email": "taken@example.com", "full_name": "New Person", "role": "cashier"},
        format="json",
    )

    assert response.status_code == 409


# --------------------------------------------------------------------------
# PUT/DELETE /admin/staff/{id} -- Platform Admin only
# --------------------------------------------------------------------------


def test_update_staff_rejected_for_non_admin():
    account = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    client = _authed_client(_make_visitor())

    response = client.put(
        f"/api/v1/admin/staff/{account.id}/", {"active": False}, format="json"
    )

    assert response.status_code == 403


def test_update_staff_allowed_for_platform_admin():
    account = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    client = _authed_client(_make_admin())

    response = client.put(
        f"/api/v1/admin/staff/{account.id}/",
        {"role": "museum_manager"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["role"] == "museum_manager"


def test_deactivate_staff_rejected_for_non_admin():
    account = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    client = _authed_client(_make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com"))

    response = client.delete(f"/api/v1/admin/staff/{account.id}/")

    assert response.status_code == 403


def test_deactivate_staff_allowed_for_platform_admin():
    account = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    client = _authed_client(_make_admin())

    response = client.delete(f"/api/v1/admin/staff/{account.id}/")

    assert response.status_code == 204
    account.refresh_from_db()
    assert account.active is False
