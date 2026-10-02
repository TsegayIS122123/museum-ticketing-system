from unittest import mock

import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_liveness_is_unauthenticated_and_uncached(client):
    response = client.get(reverse("healthz"))
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "no-cache" in response["Cache-Control"]


@pytest.mark.django_db
def test_readiness_ok_when_dependencies_answer(client):
    response = client.get(reverse("readyz"))
    assert response.status_code == 200
    assert response.json()["checks"] == {"database": "ok", "redis": "ok"}


@pytest.mark.django_db
def test_readiness_503_names_the_failing_dependency(client):
    with mock.patch("apps.core.health._check_redis", return_value="error"):
        response = client.get(reverse("readyz"))
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["checks"] == {"database": "ok", "redis": "error"}


@pytest.mark.django_db
def test_probes_reject_non_get(client):
    assert client.post(reverse("healthz")).status_code == 405
