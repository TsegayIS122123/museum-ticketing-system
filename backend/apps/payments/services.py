"""
payments -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests -- the actual Chapa HTTP call is isolated in
`_initialize_chapa_checkout` below so tests can monkeypatch/mock exactly
that one function instead of the network.

Two entry points, matching Document 03 Sec 4.2's sequence diagram:

- `create_checkout_session` -- called by `apps.bookings`' view layer right
  after any booking (individual or group, FR-BOOK-001/003 alike) is
  created, leaving it `awaiting_payment` with no `chapa_checkout_url` set
  yet (see bookings/services.py's own docstring). This keeps `payments`
  depending on `bookings`, never the reverse (Design Spec Sec 3.2):
  nothing in `bookings` imports this module: its *view* layer composes
  both apps' services.

- `confirm_payment_from_webhook` -- the only path that confirms a booking
  (FR-PAY-002); the client-side `return_url` redirect is never trusted on
  its own.
"""

import hashlib
import hmac
import logging
import uuid

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from apps.bookings.models import Booking
from apps.core.exceptions import Conflict
from apps.core.services import write_audit_log

from .models import Payment

logger = logging.getLogger(__name__)

CHAPA_BASE_URL = "https://api.chapa.co/v1"
CHAPA_TIMEOUT_SECONDS = 15

# Chapa's webhook `status` values that mean "the visitor actually paid" --
# everything else (failed, cancelled, pending, ...) is treated as a failed
# attempt, never as a silent success.
_CHAPA_SUCCESS_STATUSES = {"success", "successful"}


class PaymentGatewayError(APIException):
    """The Chapa API itself is unreachable or returned an error -- distinct
    from a `ValidationError` (bad input) or `Conflict` (bad booking state):
    this is an upstream dependency failure, surfaced as 502 so a caller
    knows retrying may help."""

    status_code = 502
    default_detail = "Could not reach the payment provider. Please try again."
    default_code = "payment_gateway_error"


# --------------------------------------------------------------------------
# Checkout session creation (FR-PAY-001)
# --------------------------------------------------------------------------


def _generate_tx_ref(booking):
    # Human-traceable (carries the booking id) but not guessable -- suffixed
    # with a random component so a retried checkout after a failed attempt
    # never collides with the earlier `tx_ref` (Payment.tx_ref is UNIQUE).
    return f"museum-{booking.id.hex}-{uuid.uuid4().hex[:10]}"


def _split_name(full_name):
    """Chapa's init API wants first_name/last_name separately; this system
    only ever collects one `full_name` (Document 05 Sec 3.1)."""
    parts = (full_name or "").strip().split(maxsplit=1)
    if not parts:
        return "Visitor", "Visitor"
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], parts[1]


def _initialize_chapa_checkout(*, tx_ref, booking, amount):
    """The one function that actually talks to Chapa -- isolated so
    services-level tests can monkeypatch this instead of the network
    (mirrors how `apps.notifications.tasks.send_notification` is mocked
    at its call site in `apps.accounts`' tests, applied here to an
    outbound HTTP call instead of a Celery task).

    `amount` is charged to Chapa, not read from `booking.total_amount_etb`
    directly -- for a booking's first-ever payment the two are the same
    (see `create_checkout_session`'s default below), but a category-
    correction top-up (ID-verification addendum) charges only the
    outstanding *difference*, while `booking.total_amount_etb` already
    holds the new, corrected *total* by the time this runs -- charging
    that instead would double-bill the portion the visitor already
    paid."""
    first_name, last_name = _split_name(booking.visitor.full_name)
    payload = {
        "amount": str(amount),
        "currency": "ETB",
        "email": booking.visitor.email,
        "first_name": first_name,
        "last_name": last_name,
        "phone_number": booking.visitor.phone or "",
        "tx_ref": tx_ref,
        "callback_url": (
            f"{settings.PUBLIC_API_BASE_URL.rstrip('/')}/api/v1/payments/webhooks/chapa/"
        ),
        "return_url": f"{settings.PUBLIC_WEB_BASE_URL.rstrip('/')}/bookings/{booking.id}",
        "customization": {
            "title": "Museum Ticket",
            "description": f"{booking.category_name_en} x{booking.booked_quantity}",
        },
    }

    try:
        response = requests.post(
            f"{CHAPA_BASE_URL}/transaction/initialize",
            json=payload,
            headers={"Authorization": f"Bearer {settings.CHAPA_SECRET_KEY}"},
            timeout=CHAPA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Chapa checkout initialization failed for booking %s", booking.id)
        raise PaymentGatewayError() from exc

    checkout_url = (data.get("data") or {}).get("checkout_url")
    if data.get("status") != "success" or not checkout_url:
        logger.error(
            "Chapa returned an unexpected response for booking %s: %s", booking.id, data
        )
        raise PaymentGatewayError()

    return checkout_url


@transaction.atomic
def create_checkout_session(*, booking, amount=None):
    """Implements FR-PAY-001 and Document 04's "response includes a
    checkout URL" on `POST /bookings` (individual or group alike).

    `amount` defaults to `booking.total_amount_etb` -- correct for a
    booking's first-ever payment, since nothing has been paid yet. The
    ID-verification addendum's category-correction flow
    (`apps.bookings.views.BookingCategoryCorrectionView`) passes an
    explicit `amount` instead: just the outstanding difference for an
    undercharge, since part of the (now higher) `total_amount_etb` was
    already paid and confirmed before the correction. Either way, this
    is a *second* `Payment` row against the same booking in the
    correction case -- `Payment`'s own docstring already documents a
    booking accumulating more than one row (a retried checkout after a
    failed attempt is the other case), so no model change was needed for
    this to work.

    Idempotency guard: if this booking already has an open (`initiated`)
    payment with a `checkout_url`, that session is reused instead of
    opening a second one with Chapa -- covers a retried request, in the
    same spirit as NFR-IDEMPOTENT-001 even though FR-PAY-004's own
    DB-level guarantee (`tx_ref` UNIQUE) is specifically about the
    *webhook* side. Reused as-is, correction included: by the time a
    correction runs, the booking's original payment is always already
    `completed` (the booking had to be `Pending` to be corrected), so this
    guard can only ever find an `initiated` row left behind by a retried
    attempt at the *same* correction, never the original payment.
    """
    if booking.status != Booking.Status.AWAITING_PAYMENT:
        raise Conflict("This booking is not awaiting payment.")

    if amount is None:
        amount = booking.total_amount_etb

    existing = (
        Payment.objects.select_for_update()
        .filter(booking=booking, status=Payment.Status.INITIATED)
        .order_by("-created_at")
        .first()
    )
    if existing is not None and existing.checkout_url:
        return existing

    tx_ref = _generate_tx_ref(booking)
    checkout_url = _initialize_chapa_checkout(tx_ref=tx_ref, booking=booking, amount=amount)

    payment = Payment.objects.create(
        booking=booking,
        tx_ref=tx_ref,
        amount_etb=amount,
        currency="ETB",
        checkout_url=checkout_url,
    )

    booking.chapa_checkout_url = checkout_url
    booking.save(update_fields=["chapa_checkout_url", "updated_at"])

    write_audit_log(
        actor_id=booking.visitor_id,
        action="payment.checkout_initiated",
        target_type="payment",
        target_id=payment.id,
        metadata={"booking_id": str(booking.id), "tx_ref": tx_ref},
    )
    return payment


# --------------------------------------------------------------------------
# Webhook signature verification (NFR-SEC-001)
# --------------------------------------------------------------------------


def verify_webhook_signature(*, raw_body: bytes, signature_header) -> bool:
    """Chapa signs the raw request body with HMAC-SHA256 using the webhook
    secret configured in the Chapa dashboard (`CHAPA_WEBHOOK_SECRET`),
    sent back in the `X-Chapa-Signature` header. (Chapa also sends a
    `Chapa-Signature` header, but that one is HMAC(secret, secret) --
    a constant that is NOT derived from the payload -- so it must never
    be checked here.) This -- not the payload's own `tx_ref`/`status`
    fields -- is what makes a webhook call trustworthy before any booking
    state changes (NFR-SEC-001, Document 03 Sec 4.2). An empty/missing
    secret or header never verifies, even in development -- there is no
    "skip verification" mode.
    """
    if not signature_header or not settings.CHAPA_WEBHOOK_SECRET:
        return False

    expected = hmac.new(
        settings.CHAPA_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


# --------------------------------------------------------------------------
# Webhook-confirmed payment (FR-PAY-002, FR-PAY-004)
# --------------------------------------------------------------------------


@transaction.atomic
def confirm_payment_from_webhook(*, payload: dict):
    """Implements FR-PAY-002/FR-PAY-004. The *only* path that confirms a
    booking (Document 03 Sec 4.2) -- the client-side `return_url` redirect
    after checkout is never trusted on its own.

    Safe to call more than once for the same `tx_ref`: a payment that is
    already `confirmed_at` is a no-op that still records the replayed
    webhook body, rather than re-applying the booking transition
    (FR-PAY-004, NFR-IDEMPOTENT-001).
    """
    tx_ref = payload.get("tx_ref")
    if not tx_ref:
        raise ValidationError({"tx_ref": "Required."})

    try:
        payment = (
            Payment.objects.select_for_update().select_related("booking").get(tx_ref=tx_ref)
        )
    except Payment.DoesNotExist:
        raise ValidationError({"tx_ref": "Unknown transaction reference."})

    now = timezone.now()
    payment.webhook_payload = payload
    payment.webhook_received_at = now

    if payment.confirmed_at is not None:
        payment.save(update_fields=["webhook_payload", "webhook_received_at", "updated_at"])
        return payment

    gateway_status = str(payload.get("status", "")).lower()
    if gateway_status not in _CHAPA_SUCCESS_STATUSES:
        payment.status = Payment.Status.FAILED
        payment.save(
            update_fields=["status", "webhook_payload", "webhook_received_at", "updated_at"]
        )
        write_audit_log(
            actor_id=None,
            action="payment.failed",
            target_type="payment",
            target_id=payment.id,
            metadata={"tx_ref": tx_ref, "gateway_status": gateway_status},
        )
        return payment

    payment.status = Payment.Status.COMPLETED
    payment.confirmed_at = now
    payment.save(
        update_fields=[
            "status",
            "confirmed_at",
            "webhook_payload",
            "webhook_received_at",
            "updated_at",
        ]
    )

    booking = payment.booking
    booking.status = Booking.Status.PENDING
    # Sec 3.3: "cleared once payment is confirmed" -- the checkout link is
    # no longer meaningful once the booking is Pending.
    booking.chapa_checkout_url = None
    booking.save(update_fields=["status", "chapa_checkout_url", "updated_at"])

    write_audit_log(
        actor_id=None,
        action="payment.confirmed",
        target_type="payment",
        target_id=payment.id,
        metadata={"booking_id": str(booking.id), "tx_ref": tx_ref},
    )

    # Both off the request path (NFR-PERF-001) -- the webhook handler only
    # enqueues them, never renders/sends synchronously.
    from apps.notifications.tasks import send_notification

    from .tasks import render_and_store_receipt

    render_and_store_receipt.delay(booking_id=str(booking.id))
    send_notification.delay(
        account_id=str(booking.visitor_id),
        notification_type="booking_payment_confirmed",
        context={"booking_id": str(booking.id), "reference": booking.reference},
    )

    return payment
