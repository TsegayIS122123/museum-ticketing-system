"""
HTTP-level tests for the Museum-Manager-or-Platform-Admin-only permission
boundary (FR-REPORT-001/002) -- a view-layer concern
(`core.permissions.IsMuseumManagerOrPlatformAdmin`) that test_services.py,
by design, never exercises (Design Spec Sec 3.1: services assume the
caller has already been authorized). Also covers the query-parameter
validation `views.py` itself owns (missing/invalid `period`, malformed
dates) -- as opposed to the range-resolution logic behind it, which is
covered directly against `services.resolve_period_range`.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import AccountRefreshToken
from apps.accounts.models import Account

pytestmark = pytest.mark.django_db


def _make_staff(role, email="staff@example.com"):
    account = Account(email=email, full_name="Staff Person", role=role)
    account.set_password("a-strong-password-1")
    account.save()
    return account


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
# GET /reports/dashboard -- Museum Manager/Platform Admin only
# --------------------------------------------------------------------------


def test_dashboard_requires_authentication():
    response = APIClient().get("/api/v1/reports/dashboard/")
    assert response.status_code == 401


def test_dashboard_rejects_cashier():
    cashier = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    response = _authed_client(cashier).get("/api/v1/reports/dashboard/")
    assert response.status_code == 403


def test_dashboard_rejects_visitor():
    visitor = _make_visitor()
    response = _authed_client(visitor).get("/api/v1/reports/dashboard/")
    assert response.status_code == 403


def test_dashboard_allows_museum_manager():
    manager = _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    response = _authed_client(manager).get("/api/v1/reports/dashboard/")
    assert response.status_code == 200
    assert response.data["revenueTotalEtb"] == "0.00"
    assert response.data["statusMix"] == {
        "pending": 0,
        "visited": 0,
        "cancelled": 0,
        "refunded": 0,
    }


def test_dashboard_allows_platform_admin():
    admin = _make_staff(Account.Role.PLATFORM_ADMIN, email="admin@example.com")
    response = _authed_client(admin).get("/api/v1/reports/dashboard/")
    assert response.status_code == 200


# --------------------------------------------------------------------------
# GET /reports/summary -- Museum Manager/Platform Admin only
# --------------------------------------------------------------------------


def test_summary_requires_authentication():
    response = APIClient().get("/api/v1/reports/summary/?period=daily")
    assert response.status_code == 401


def test_summary_rejects_cashier():
    cashier = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    response = _authed_client(cashier).get("/api/v1/reports/summary/?period=daily")
    assert response.status_code == 403


def test_summary_requires_period():
    manager = _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    response = _authed_client(manager).get("/api/v1/reports/summary/")
    assert response.status_code == 400


def test_summary_rejects_invalid_period():
    manager = _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    response = _authed_client(manager).get(
        "/api/v1/reports/summary/?period=fortnightly"
    )
    assert response.status_code == 400


def test_summary_rejects_malformed_date():
    manager = _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    response = _authed_client(manager).get(
        "/api/v1/reports/summary/?period=daily&from=not-a-date&to=2025-01-01"
    )
    assert response.status_code == 400


def test_summary_returns_period_and_range_for_museum_manager():
    manager = _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    response = _authed_client(manager).get(
        "/api/v1/reports/summary/"
        "?period=monthly&from=2025-01-01&to=2025-01-31"
    )
    assert response.status_code == 200
    assert response.data["period"] == "monthly"
    assert response.data["from"] == "2025-01-01"
    assert response.data["to"] == "2025-01-31"
    assert response.data["revenueByCategory"] == {}
    assert response.data["visitorCountsByGroup"] == {}
