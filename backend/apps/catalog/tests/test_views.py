"""
HTTP-level tests for the Museum-Manager-only permission boundary
(FR-CAT-002, Document 07 TC-CAT-002a) -- a view-layer concern
(`core.permissions.IsMuseumManager`) that test_services.py, by design,
never exercises (Design Spec Sec 3.1: services assume the caller has
already been authorized).
"""

from decimal import Decimal

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.authentication import AccountRefreshToken
from apps.accounts.models import Account
from apps.catalog.models import Category

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_slate():
    # See test_services.py's identical fixture: migration 0002 seeds five
    # categories into every fresh test database; these tests want a clean
    # slate rather than asserting against seeded data.
    cache.clear()
    Category.objects.all().delete()
    yield
    cache.clear()


def _make_staff(role, email="staff@example.com", password="a-strong-password-1"):
    account = Account(email=email, full_name="Staff Person", role=role)
    account.set_password(password)
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


def _make_category(name_en="Student", price_etb="50.00", active=True):
    return Category.objects.create(
        name_en=name_en, name_am=name_en, price_etb=Decimal(price_etb), active=active
    )


# --------------------------------------------------------------------------
# GET /categories -- public
# --------------------------------------------------------------------------


def test_list_categories_is_public():
    _make_category()

    response = APIClient().get("/api/v1/categories/")

    assert response.status_code == 200
    assert response.data["meta"]["total"] == 1
    assert len(response.data["data"]) == 1


def test_list_categories_excludes_retired():
    _make_category(name_en="Active")
    _make_category(name_en="Retired", active=False)

    response = APIClient().get("/api/v1/categories/")

    assert [c["name_en"] for c in response.data["data"]] == ["Active"]


# --------------------------------------------------------------------------
# POST /categories -- Museum Manager only (TC-CAT-002a)
# --------------------------------------------------------------------------


def test_create_category_rejected_for_anonymous():
    response = APIClient().post(
        "/api/v1/categories/",
        {"name_en": "Student", "name_am": "ተማሪ", "price_etb": "50.00"},
        format="json",
    )

    assert response.status_code == 401


def test_create_category_rejected_for_visitor():
    client = _authed_client(_make_visitor())

    response = client.post(
        "/api/v1/categories/",
        {"name_en": "Student", "name_am": "ተማሪ", "price_etb": "50.00"},
        format="json",
    )

    assert response.status_code == 403


def test_create_category_rejected_for_cashier():
    client = _authed_client(_make_staff(Account.Role.CASHIER))

    response = client.post(
        "/api/v1/categories/",
        {"name_en": "Student", "name_am": "ተማሪ", "price_etb": "50.00"},
        format="json",
    )

    assert response.status_code == 403


def test_create_category_rejected_for_platform_admin():
    client = _authed_client(_make_staff(Account.Role.PLATFORM_ADMIN, email="admin@example.com"))

    response = client.post(
        "/api/v1/categories/",
        {"name_en": "Student", "name_am": "ተማሪ", "price_etb": "50.00"},
        format="json",
    )

    assert response.status_code == 403


def test_create_category_allowed_for_museum_manager():
    client = _authed_client(_make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com"))

    response = client.post(
        "/api/v1/categories/",
        {"name_en": "Student", "name_am": "ተማሪ", "price_etb": "50.00"},
        format="json",
    )

    assert response.status_code == 201
    assert Category.objects.filter(name_en="Student").exists()


# --------------------------------------------------------------------------
# PUT/DELETE /categories/{id} -- Museum Manager only
# --------------------------------------------------------------------------


def test_update_category_rejected_for_non_manager():
    category = _make_category()
    client = _authed_client(_make_visitor())

    response = client.put(
        f"/api/v1/categories/{category.id}/", {"price_etb": "60.00"}, format="json"
    )

    assert response.status_code == 403


def test_update_category_allowed_for_museum_manager():
    category = _make_category(price_etb="50.00")
    client = _authed_client(_make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com"))

    response = client.put(
        f"/api/v1/categories/{category.id}/", {"price_etb": "60.00"}, format="json"
    )

    assert response.status_code == 200
    assert response.data["price_etb"] == "60.00"


def test_retire_category_rejected_for_non_manager():
    category = _make_category()
    client = _authed_client(_make_staff(Account.Role.CASHIER))

    response = client.delete(f"/api/v1/categories/{category.id}/")

    assert response.status_code == 403


def test_retire_category_allowed_for_museum_manager():
    category = _make_category()
    client = _authed_client(_make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com"))

    response = client.delete(f"/api/v1/categories/{category.id}/")

    assert response.status_code == 204
    category.refresh_from_db()
    assert category.active is False
