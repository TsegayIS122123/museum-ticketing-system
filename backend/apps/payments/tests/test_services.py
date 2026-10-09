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
import re

import pytest
import requests
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
        tx_ref=mock.ANY, booking=booking, amount=Decimal("30.00"), client_platform="web"
    )


@mock.patch("apps.payments.services._initialize_chapa_checkout", return_value=FAKE_CHECKOUT_URL)
def test_create_checkout_session_defaults_amount_to_booking_total(mock_init):
    booking = _make_booking(quantity=1)

    payment = services.create_checkout_session(booking=booking)

    assert payment.amount_etb == booking.total_amount_etb
    mock_init.assert_called_once_with(
        tx_ref=mock.ANY, booking=booking, amount=booking.total_amount_etb, client_platform="web"
    )


# --------------------------------------------------------------------------
# _build_chapa_description -- Chapa's `customization.description` field
# only accepts letters, numbers, hyphens, underscores, spaces, and dots
# (see the 400 Chapa returns otherwise); a booking's line items are
# joined into this field and must never smuggle a rejected character
# through, regardless of how many categories or what punctuation their
# names contain.
# --------------------------------------------------------------------------


def test_build_chapa_description_joins_multiple_categories_without_comma():
    visitor = _make_visitor()
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=3,
        total_amount_etb=Decimal("300.00"),
        status=Booking.Status.AWAITING_PAYMENT,
    )
    adult = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=Decimal("100.00")
    )
    student = Category.objects.create(
        name_en="Student", name_am="Student", price_etb=Decimal("100.00")
    )
    BookingItem.objects.create(
        booking=booking, category=adult, category_name_en=adult.name_en,
        category_name_am=adult.name_am, unit_price_etb=adult.price_etb,
        quantity=1, subtotal_etb=Decimal("100.00"),
    )
    BookingItem.objects.create(
        booking=booking, category=student, category_name_en=student.name_en,
        category_name_am=student.name_am, unit_price_etb=student.price_etb,
        quantity=2, subtotal_etb=Decimal("200.00"),
    )

    description = services._build_chapa_description(booking)

    assert "," not in description
    assert "Adult x1" in description
    assert "Student x2" in description


def test_build_chapa_description_strips_disallowed_characters():
    booking = _make_booking(quantity=1)
    item = booking.items.first()
    item.category_name_en = "VIP (Members)!"
    item.save(update_fields=["category_name_en"])

    description = services._build_chapa_description(booking)

    assert re.fullmatch(r"[A-Za-z0-9\-_. ]*", description)


def test_build_chapa_description_falls_back_when_fully_stripped():
    booking = _make_booking(quantity=1)
    item = booking.items.first()
    item.category_name_en = "!!!"
    item.save(update_fields=["category_name_en"])
    # Force a description that strips to nothing.
    with mock.patch.object(
        services, "_CHAPA_DESCRIPTION_ALLOWED", re.compile(r".*")
    ):
        description = services._build_chapa_description(booking)

    assert description == "Museum Ticket"


def test_build_chapa_description_truncates_to_chapa_50_char_limit():
    """Chapa's own 400 for this field is
    '"customization.description must not exceed 50 characters"' -- a
    booking with several categories, or one long category name, can
    exceed that on its own, so the built description must never be
    handed to Chapa untrimmed regardless of how many items or how long
    their names are."""
    visitor = _make_visitor()
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=4,
        total_amount_etb=Decimal("400.00"),
        status=Booking.Status.AWAITING_PAYMENT,
    )
    categories = [
        ("Adult", 1),
        ("Student", 2),
        ("Senior Citizen Discount Rate", 3),
        ("Child Under Five Years Old", 1),
    ]
    for name, quantity in categories:
        category = Category.objects.create(
            name_en=name, name_am=name, price_etb=Decimal("100.00")
        )
        BookingItem.objects.create(
            booking=booking, category=category, category_name_en=category.name_en,
            category_name_am=category.name_am, unit_price_etb=category.price_etb,
            quantity=quantity, subtotal_etb=category.price_etb * quantity,
        )

    description = services._build_chapa_description(booking)

    assert len(description) <= services._CHAPA_DESCRIPTION_MAX_LENGTH
    # Trimmed at a complete item boundary, not mid-item.
    assert description == "Adult x1 - Student x2"


def test_build_chapa_description_hard_truncates_single_overlong_item():
    booking = _make_booking(quantity=1)
    item = booking.items.first()
    item.category_name_en = "International Researcher Visa-Holder Long Category Name"
    item.save(update_fields=["category_name_en"])

    description = services._build_chapa_description(booking)

    assert len(description) == services._CHAPA_DESCRIPTION_MAX_LENGTH


@mock.patch("apps.payments.services.requests.post")
def test_initialize_chapa_checkout_sends_sanitized_description(mock_post, settings):
    settings.PUBLIC_API_BASE_URL = "https://api.example.com"
    settings.PUBLIC_WEB_BASE_URL = "https://web.example.com"
    settings.CHAPA_SECRET_KEY = "test-secret"
    mock_post.return_value = mock.Mock(
        ok=True,
        json=lambda: {"status": "success", "data": {"checkout_url": FAKE_CHECKOUT_URL}},
    )
    visitor = _make_visitor()
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=3,
        total_amount_etb=Decimal("300.00"),
        status=Booking.Status.AWAITING_PAYMENT,
    )
    adult = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=Decimal("100.00")
    )
    student = Category.objects.create(
        name_en="Student", name_am="Student", price_etb=Decimal("100.00")
    )
    BookingItem.objects.create(
        booking=booking, category=adult, category_name_en=adult.name_en,
        category_name_am=adult.name_am, unit_price_etb=adult.price_etb,
        quantity=1, subtotal_etb=Decimal("100.00"),
    )
    BookingItem.objects.create(
        booking=booking, category=student, category_name_en=student.name_en,
        category_name_am=student.name_am, unit_price_etb=student.price_etb,
        quantity=2, subtotal_etb=Decimal("200.00"),
    )

    services._initialize_chapa_checkout(
        tx_ref="museum-test-ref", booking=booking, amount=Decimal("300.00")
    )

    sent_description = mock_post.call_args.kwargs["json"]["customization"]["description"]
    assert "," not in sent_description


# --------------------------------------------------------------------------
# _normalize_chapa_phone -- Chapa's `phone_number` field wants Ethiopian
# local format (10 digits, leading 0); `Account.phone` is free text (the
# verify form's own placeholder is "+251 912 345 678") and is stored
# exactly as typed, so whatever shape it arrives in has to be reduced to
# Chapa's before it's sent, or Chapa 400s on the punctuation/country code.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("+251 912 345 678", "0912345678"),
        ("251912345678", "0912345678"),
        ("0912345678", "0912345678"),
        ("912345678", "0912345678"),
        ("+251-91-100-0000", "0911000000"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_chapa_phone(raw, expected):
    assert services._normalize_chapa_phone(raw) == expected


@mock.patch("apps.payments.services.requests.post")
def test_initialize_chapa_checkout_sends_normalized_phone(mock_post, settings):
    settings.PUBLIC_API_BASE_URL = "https://api.example.com"
    settings.PUBLIC_WEB_BASE_URL = "https://web.example.com"
    settings.CHAPA_SECRET_KEY = "test-secret"
    mock_post.return_value = mock.Mock(
        ok=True,
        json=lambda: {"status": "success", "data": {"checkout_url": FAKE_CHECKOUT_URL}},
    )
    # Mirrors the verify form's own placeholder shape -- the exact string a
    # real visitor is nudged into typing.
    visitor = _make_visitor()
    visitor.phone = "+251 912 345 678"
    visitor.save(update_fields=["phone"])
    booking = _make_booking(visitor=visitor)

    services._initialize_chapa_checkout(
        tx_ref="museum-test-ref", booking=booking, amount=Decimal("200.00")
    )

    sent_phone = mock_post.call_args.kwargs["json"]["phone_number"]
    assert sent_phone == "0912345678"


@mock.patch("apps.payments.services.requests.post")
def test_initialize_chapa_checkout_logs_response_body_on_400(mock_post, settings, caplog):
    """A validation 400 names the exact rejected field in its body -- that
    detail must reach the logs (not just a bare "failed" line), or every
    Chapa rejection is undebuggable without live access to Chapa itself.
    """
    settings.PUBLIC_API_BASE_URL = "https://api.example.com"
    settings.PUBLIC_WEB_BASE_URL = "https://web.example.com"
    settings.CHAPA_SECRET_KEY = "test-secret"
    mock_response = mock.Mock(ok=False, status_code=400, text='{"message": "amount must be greater than 0"}')
    mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
        response=mock_response
    )
    mock_post.return_value = mock_response
    booking = _make_booking()

    with caplog.at_level("ERROR"):
        with pytest.raises(services.PaymentGatewayError):
            services._initialize_chapa_checkout(
                tx_ref="museum-test-ref", booking=booking, amount=Decimal("0.00")
            )

    assert any(
        "amount must be greater than 0" in record.getMessage() for record in caplog.records
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
