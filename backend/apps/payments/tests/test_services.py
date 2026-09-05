"""
Unit tests against payments/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage.

Every test here mocks `_initialize_chapa_checkout` -- the one function
that actually talks to Chapa -- rather than the network, mirroring how
`apps.accounts`' tests mock `send_notification.delay` instead of Redis.
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem
from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.payments import services
from apps.payments.models import Payment

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)
FAKE_CHECKOUT_URL = "https://checkout.chapa.co/checkout/test-session"


def _make_visitor(email="visitor@example.com"):
    account = Account(
        email=email, phone="+251911000000", full_name="Hana Bekele", role=Account.Role.VISITOR
    )
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_booking(*, visitor=None, status=Booking.Status.AWAITING_PAYMENT, quantity=2):
    visitor = visitor or _make_visitor()
    category = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=Decimal("100.00")
    )
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=quantity,
        total_amount_etb=category.price_etb * quantity,
        status=status,
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
# create_checkout_session (FR-PAY-001)
# --------------------------------------------------------------------------


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_create_checkout_session_creates_payment_and_sets_checkout_url(mock_init):
    booking = _make_booking()

    payment = services.create_checkout_session(booking=booking)

    booking.refresh_from_db()
    assert payment.status == Payment.Status.INITIATED
    assert payment.checkout_url == FAKE_CHECKOUT_URL
    assert payment.amount_etb == booking.total_amount_etb
    assert booking.chapa_checkout_url == FAKE_CHECKOUT_URL
    mock_init.assert_called_once()


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_create_checkout_session_rejects_booking_not_awaiting_payment(mock_init):
    booking = _make_booking(status=Booking.Status.PENDING)

    with pytest.raises(Conflict):
        services.create_checkout_session(booking=booking)
    mock_init.assert_not_called()


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_create_checkout_session_reuses_existing_open_session(mock_init):
    booking = _make_booking()

    first = services.create_checkout_session(booking=booking)
    second = services.create_checkout_session(booking=booking)

    assert first.id == second.id
    assert Payment.objects.filter(booking=booking).count() == 1
    mock_init.assert_called_once()


@mock.patch(
    "apps.payments.services._initialize_chapa_checkout",
    side_effect=services.PaymentGatewayError(),
)
def test_create_checkout_session_surfaces_gateway_failure(mock_init):
    booking = _make_booking()

    with pytest.raises(services.PaymentGatewayError):
        services.create_checkout_session(booking=booking)
    assert Payment.objects.filter(booking=booking).count() == 0


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_create_checkout_session_charges_explicit_amount_not_the_booking_total(mock_init):
    """The ID-verification addendum's category-correction top-up: the
    booking's own total_amount_etb already reflects the new, corrected
    (higher) total by the time this runs -- only the outstanding
    difference should ever be charged again, never the full total a
    second time."""
    booking = _make_booking(quantity=1)  # total_amount_etb = 100.00 ETB

    payment = services.create_checkout_session(booking=booking, amount=Decimal("30.00"))

    assert payment.amount_etb == Decimal("30.00")
    mock_init.assert_called_once_with(
        tx_ref=mock.ANY, booking=booking, amount=Decimal("30.00")
    )


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_create_checkout_session_defaults_amount_to_booking_total(mock_init):
    booking = _make_booking(quantity=1)

    payment = services.create_checkout_session(booking=booking)

    assert payment.amount_etb == booking.total_amount_etb
    mock_init.assert_called_once_with(
        tx_ref=mock.ANY, booking=booking, amount=booking.total_amount_etb
    )


# --------------------------------------------------------------------------
# verify_webhook_signature (NFR-SEC-001)
# --------------------------------------------------------------------------


def test_verify_webhook_signature_accepts_correct_hmac(settings):
    settings.CHAPA_WEBHOOK_SECRET = "a-webhook-secret"
    body = b'{"tx_ref": "abc", "status": "success"}'
    import hashlib
    import hmac as hmac_module

    expected = hmac_module.new(b"a-webhook-secret", body, hashlib.sha256).hexdigest()

    assert services.verify_webhook_signature(raw_body=body, signature_header=expected) is True


def test_verify_webhook_signature_rejects_wrong_signature(settings):
    settings.CHAPA_WEBHOOK_SECRET = "a-webhook-secret"
    body = b'{"tx_ref": "abc", "status": "success"}'

    assert services.verify_webhook_signature(raw_body=body, signature_header="not-it") is False


def test_verify_webhook_signature_rejects_missing_header(settings):
    settings.CHAPA_WEBHOOK_SECRET = "a-webhook-secret"

    assert services.verify_webhook_signature(raw_body=b"{}", signature_header=None) is False


def test_verify_webhook_signature_rejects_when_secret_unconfigured(settings):
    settings.CHAPA_WEBHOOK_SECRET = ""

    assert services.verify_webhook_signature(raw_body=b"{}", signature_header="anything") is False


# --------------------------------------------------------------------------
# confirm_payment_from_webhook (FR-PAY-002, FR-PAY-004)
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.payments.tasks.render_and_store_receipt.delay")
@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_confirm_payment_from_webhook_success_moves_booking_to_pending(
    mock_init, mock_render, mock_notify
):
    booking = _make_booking()
    payment = services.create_checkout_session(booking=booking)

    result = services.confirm_payment_from_webhook(
        payload={"tx_ref": payment.tx_ref, "status": "success", "amount": "200.00"}
    )

    booking.refresh_from_db()
    result.refresh_from_db()
    assert result.status == Payment.Status.COMPLETED
    assert result.confirmed_at is not None
    assert booking.status == Booking.Status.PENDING
    assert booking.chapa_checkout_url is None
    mock_render.assert_called_once_with(booking_id=str(booking.id))
    mock_notify.assert_called_once()


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_confirm_payment_from_webhook_failure_status_does_not_confirm_booking(mock_init):
    booking = _make_booking()
    payment = services.create_checkout_session(booking=booking)

    result = services.confirm_payment_from_webhook(
        payload={"tx_ref": payment.tx_ref, "status": "failed"}
    )

    booking.refresh_from_db()
    assert result.status == Payment.Status.FAILED
    assert result.confirmed_at is None
    assert booking.status == Booking.Status.AWAITING_PAYMENT


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.payments.tasks.render_and_store_receipt.delay")
@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_confirm_payment_from_webhook_is_idempotent_on_replay(
    mock_init, mock_render, mock_notify
):
    booking = _make_booking()
    payment = services.create_checkout_session(booking=booking)
    payload = {"tx_ref": payment.tx_ref, "status": "success"}

    services.confirm_payment_from_webhook(payload=payload)
    services.confirm_payment_from_webhook(payload=payload)

    booking.refresh_from_db()
    assert booking.status == Booking.Status.PENDING
    # The booking transition and its side effects only ever fire once.
    mock_render.assert_called_once()
    mock_notify.assert_called_once()


def test_confirm_payment_from_webhook_rejects_unknown_tx_ref():
    with pytest.raises(ValidationError):
        services.confirm_payment_from_webhook(
            payload={"tx_ref": "does-not-exist", "status": "success"}
        )


def test_confirm_payment_from_webhook_requires_tx_ref():
    with pytest.raises(ValidationError):
        services.confirm_payment_from_webhook(payload={"status": "success"})
