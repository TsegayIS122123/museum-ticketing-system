"""
HTTP-level tests for the Chapa webhook endpoint's signature-check wiring
(Design Spec Sec 3.1: services.py, exercised in test_services.py, assumes
the caller is already verified -- this module proves that boundary from
the outside, mirroring apps.bookings.tests.test_views).
"""

import hashlib
import hmac
import json
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Account
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.payments.models import Payment

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)
WEBHOOK_URL = "/api/v1/payments/webhooks/chapa/"


def _make_visitor(email="visitor@example.com"):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_payment(status=Payment.Status.INITIATED):
    visitor = _make_visitor()
    category = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=Decimal("100.00")
    )
    booking = Booking.objects.create(
        visitor=visitor,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=1,
        total_amount_etb=category.price_etb,
        status=Booking.Status.AWAITING_PAYMENT,
    )
    return Payment.objects.create(
        booking=booking,
        tx_ref="museum-test-tx-ref",
        amount_etb=category.price_etb,
        status=status,
    )


def _signed_post(client, body: dict, secret: str, decoy_chapa_signature: str = None):
    """Sends X-Chapa-Signature (the real, payload-based HMAC). Optionally also
    sends Chapa-Signature (Chapa's other header, HMAC(secret, secret) in
    production -- constant, not payload-derived) to mimic a real Chapa
    request and prove it's correctly ignored.
    """
    raw = json.dumps(body).encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    extra = {}
    if decoy_chapa_signature is not None:
        extra["HTTP_CHAPA_SIGNATURE"] = decoy_chapa_signature
    return client.post(
        WEBHOOK_URL,
        data=raw,
        content_type="application/json",
        HTTP_X_CHAPA_SIGNATURE=signature,
        **extra,
    )


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.payments.tasks.render_and_store_receipt.delay")
def test_webhook_confirms_payment_with_a_valid_signature(mock_render, mock_notify, settings):
    settings.CHAPA_WEBHOOK_SECRET = "test-webhook-secret"
    payment = _make_payment()

    response = _signed_post(
        APIClient(),
        {"tx_ref": payment.tx_ref, "status": "success"},
        secret="test-webhook-secret",
    )

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == Payment.Status.COMPLETED


def test_webhook_rejects_invalid_signature(settings):
    settings.CHAPA_WEBHOOK_SECRET = "test-webhook-secret"
    payment = _make_payment()

    response = _signed_post(
        APIClient(),
        {"tx_ref": payment.tx_ref, "status": "success"},
        secret="wrong-secret",
    )

    assert response.status_code == 401
    payment.refresh_from_db()
    assert payment.status == Payment.Status.INITIATED


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.payments.tasks.render_and_store_receipt.delay")
def test_webhook_confirms_payment_when_decoy_chapa_signature_header_also_present(
    mock_render, mock_notify, settings
):
    """Regression test: Chapa sends both `Chapa-Signature` (a constant,
    HMAC(secret, secret) -- never equal to HMAC(secret, body)) and
    `X-Chapa-Signature` (the real payload signature) on real webhook
    calls. The view must verify against X-Chapa-Signature and must NOT
    let the presence of the decoy header cause a false rejection.
    """
    settings.CHAPA_WEBHOOK_SECRET = "test-webhook-secret"
    payment = _make_payment()
    decoy = hmac.new(
        b"test-webhook-secret", b"test-webhook-secret", hashlib.sha256
    ).hexdigest()

    response = _signed_post(
        APIClient(),
        {"tx_ref": payment.tx_ref, "status": "success"},
        secret="test-webhook-secret",
        decoy_chapa_signature=decoy,
    )

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == Payment.Status.COMPLETED


def test_webhook_rejects_missing_signature_header(settings):
    settings.CHAPA_WEBHOOK_SECRET = "test-webhook-secret"
    payment = _make_payment()

    response = APIClient().post(
        WEBHOOK_URL,
        data=json.dumps({"tx_ref": payment.tx_ref, "status": "success"}),
        content_type="application/json",
    )

    assert response.status_code == 401


def test_webhook_returns_400_for_unknown_tx_ref(settings):
    settings.CHAPA_WEBHOOK_SECRET = "test-webhook-secret"

    response = _signed_post(
        APIClient(),
        {"tx_ref": "no-such-tx-ref", "status": "success"},
        secret="test-webhook-secret",
    )

    assert response.status_code == 400
