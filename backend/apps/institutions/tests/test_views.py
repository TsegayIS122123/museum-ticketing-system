"""
HTTP-level tests for GET /institutions/ (UAT round 1) -- a view-layer
concern (authentication requirement) test_services.py, by design, never
exercises.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import AccountRefreshToken
from apps.accounts.models import Account
from apps.institutions.models import Institution

pytestmark = pytest.mark.django_db


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


def test_lookup_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/institutions/", {"tin": "0000900158"})

    assert response.status_code == 401


def test_lookup_returns_null_for_unrecognized_tin():
    client = _authed_client(_make_visitor())

    response = client.get("/api/v1/institutions/", {"tin": "0000900158"})

    assert response.status_code == 200
    assert response.data["institution"] is None


def test_lookup_returns_institution_for_known_tin():
    Institution.objects.create(name="Example Primary School", tin="0000900158")
    client = _authed_client(_make_visitor())

    response = client.get("/api/v1/institutions/", {"tin": "0000900158"})

    assert response.status_code == 200
    assert response.data["institution"]["name"] == "Example Primary School"
    assert response.data["institution"]["tin"] == "0000900158"


def test_lookup_normalizes_tin_with_separators():
    Institution.objects.create(name="Example Primary School", tin="0000900158")
    client = _authed_client(_make_visitor())

    response = client.get("/api/v1/institutions/", {"tin": "0000-900158"})

    assert response.status_code == 200
    assert response.data["institution"]["name"] == "Example Primary School"


def test_lookup_rejects_malformed_tin():
    client = _authed_client(_make_visitor())

    response = client.get("/api/v1/institutions/", {"tin": "123"})

    assert response.status_code == 400
