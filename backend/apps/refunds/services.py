"""
refunds -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 Sec 2.6 and is unit-tested directly (NFR-MAINT-001) without
spinning up HTTP requests -- the actual Chapa HTTP calls are isolated in
`fetch_chapa_transaction_fee` and `call_chapa_refund_api` below so tests
can monkeypatch/mock exactly those two functions instead of the network
(mirrors `apps.payments.services._initialize_chapa_checkout`'s own
isolation).

Three entry points, one per FR-REFUND-001 trigger:

- `trigger_cancellation_refund`     -- (a) Visitor cancels a Pending
  booking. Called by `apps.bookings`' view layer right after
  `apps.bookings.services.cancel_booking` succeeds -- never from
  `bookings/services.py` itself, since `refunds` depends on `bookings`,
  not the reverse (Design Spec Sec 3.2).
- `request_partial_shortfall_refund` -- (b) Visitor/group leader asks for
  a refund against a recorded attendance shortfall (FR-TICKET-002).
- `trigger_no_response_refund`      -- (c) the daily no-response sweep
  (FR-PAY-005 step 2). Called by `apps.bookings.tasks.
  check_no_response_refund`.

All three funnel into `_create_refund_and_enqueue`, which only creates a
`pending` `Refund` row and hands the actual money movement to
`apps.refunds.tasks.process_refund` -- kept off the request path
(NFR-PERF-001), and retried safely by Celery if Chapa is briefly
unreachable (NFR-IDEMPOTENT-001).
"""

import logging
from decimal import Decimal

import requests
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import APIException, PermissionDenied

from apps.bookings.models import Booking
from apps.core.exceptions import Conflict
from apps.core.services import write_audit_log
from apps.payments.models import Payment

from .models import Refund

logger = logging.getLogger(__name__)

CHAPA_BASE_URL = "https://api.chapa.co/v1"
CHAPA_TIMEOUT_SECONDS = 15


class RefundGatewayError(APIException):
    """The Chapa API itself is unreachable or returned an error -- distinct
    from `Conflict` (bad booking state): this is an upstream dependency
    failure. Surfaced as 502 on the rare synchronous path that raises it;
    on the (normal) async path, `apps.refunds.tasks.process_refund`
    catches this and retries instead of letting it propagate."""

    status_code = 502
    default_detail = "Could not reach the payment provider. Please try again."
    default_code = "refund_gateway_error"


# --------------------------------------------------------------------------
# Refundable amount (FR-REFUND-002)
# --------------------------------------------------------------------------


def compute_refundable_amount(*, booking, reason):
    """Implements FR-REFUND-002: "the system determines the refundable
    amount by checking the booking's recorded visit status first ... this
    calculation must not depend on a person working it out by hand."

    This is the GROSS amount (before Chapa's fee is netted out by
    `apps.refunds.tasks.process_refund` -- FR-REFUND-003) -- never a
    figure a Cashier or Visitor types in themselves.
    """
    if reason == Refund.Reason.PARTIAL_SHORTFALL:
        attended = booking.attended_quantity or 0
        shortfall = booking.booked_quantity - attended
        return booking.unit_price_etb * shortfall
    # (a) cancellation and (c) no-response are always a full refund of
    # what was actually paid (Document 02 Sec 2.6/§2.4).
    return booking.total_amount_etb


# --------------------------------------------------------------------------
# Chapa HTTP calls (ADR-008) -- isolated so tests mock these, not requests
# --------------------------------------------------------------------------


def fetch_chapa_transaction_fee(*, tx_ref):
    """Calls Chapa's Verify Transaction endpoint
    (`GET /v1/transaction/verify/<tx_ref>`) to read back `data.charge` --
    the fee Chapa actually took on the original payment.

    Per ADR-008/FR-REFUND-003: this fee "must be computed and stored per
    refund, not assumed equal to the original charge" -- so it is always
    looked up here, never estimated from a fixed percentage.
    """
    try:
        response = requests.get(
            f"{CHAPA_BASE_URL}/transaction/verify/{tx_ref}",
            headers={"Authorization": f"Bearer {settings.CHAPA_SECRET_KEY}"},
            timeout=CHAPA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Chapa transaction verification failed for tx_ref %s", tx_ref)
        raise RefundGatewayError() from exc

    if body.get("status") != "success":
        logger.error("Chapa verify returned an unexpected response for %s: %s", tx_ref, body)
        raise RefundGatewayError()

    charge = (body.get("data") or {}).get("charge")
    # A transaction with no charge on record (e.g. a fee-free test-mode
    # payment) is a legitimate zero, not a lookup failure.
    return Decimal(str(charge)) if charge is not None else Decimal("0")


def call_chapa_refund_api(*, tx_ref, amount, reason, reference):
    """Calls Chapa's Refund endpoint (`POST /v1/refund/<tx_ref>`) --
    ADR-008. `amount` is the NET amount to hand back to the Visitor
    (gross minus Chapa's own fee, FR-REFUND-003) -- Chapa refunds exactly
    the amount given, it does not net anything out on its own side.

    `reference` is our own `Refund.id`, passed through as Chapa's
    `reference` param so a duplicate/retried call with the same reference
    is traceable back to the same refund record on Chapa's side too.

    Returns Chapa's `data.ref_id`, which `apps.refunds.tasks.process_refund`
    stores as `Refund.chapa_refund_reference` and which the separate Verify
    Refund endpoint (`GET /v1/refund/:ref_id/verify`) is keyed on.
    """
    payload = {
        "amount": str(amount),
        "reason": reason,
        "reference": reference,
    }
    try:
        response = requests.post(
            f"{CHAPA_BASE_URL}/refund/{tx_ref}",
            data=payload,
            headers={"Authorization": f"Bearer {settings.CHAPA_SECRET_KEY}"},
            timeout=CHAPA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Chapa refund initiation failed for tx_ref %s", tx_ref)
        raise RefundGatewayError() from exc

    ref_id = (body.get("data") or {}).get("ref_id")
    if body.get("status") != "success" or not ref_id:
        logger.error("Chapa refund returned an unexpected response for %s: %s", tx_ref, body)
        raise RefundGatewayError()

    return ref_id


# --------------------------------------------------------------------------
# Refund creation (shared by all three FR-REFUND-001 triggers)
# --------------------------------------------------------------------------


def _get_completed_payment(*, booking):
    payment = (
        Payment.objects.filter(booking=booking, status=Payment.Status.COMPLETED)
        .order_by("-created_at")
        .first()
    )
    if payment is None:
        # Should not be reachable from any of the three trigger paths --
        # each requires the booking to have been paid -- but this is a
        # money-moving operation, so it fails loudly rather than assuming.
        raise Conflict("This booking has no completed payment to refund.")
    return payment


def _ensure_no_existing_refund(*, booking):
    """Sec 6.7's "capped per booking to prevent repeated automated refund
    requests" -- a `pending` or `completed` refund already covers this
    booking (each of the three FR-REFUND-001 triggers is mutually
    exclusive per booking in practice: a cancelled/no-response booking
    never reaches `Visited`, and a `Visited` booking can't be cancelled).
    A `failed` refund does NOT block a fresh attempt, since that Visitor
    is still owed money.

    A `category_correction` refund (ID-verification addendum) does NOT
    count as "this booking's refund" either, and is excluded here for a
    different reason than `failed`: it's an earlier-stage price
    adjustment, not the booking's terminal outcome, so it must never
    block a later legitimate FR-REFUND-001 trigger -- e.g. a booking
    corrected (and partially refunded) at the gate can still have an
    attendance shortfall at check-in, and that Visitor is still entitled
    to request a `partial_shortfall` refund afterward.
    """
    exists = (
        Refund.objects.filter(booking=booking)
        .exclude(status=Refund.Status.FAILED)
        .exclude(reason=Refund.Reason.CATEGORY_CORRECTION)
        .exists()
    )
    if exists:
        raise Conflict("A refund has already been requested or issued for this booking.")


@transaction.atomic
def _create_refund_and_enqueue(
    *, booking, reason, requested_by=None, note=None, amount_override=None
):
    _ensure_no_existing_refund(booking=booking)
    payment = _get_completed_payment(booking=booking)

    gross_amount = (
        amount_override
        if amount_override is not None
        else compute_refundable_amount(booking=booking, reason=reason)
    )
    if gross_amount <= 0:
        raise Conflict("There is nothing to refund for this booking.")

    refund = Refund.objects.create(
        booking=booking,
        payment=payment,
        # Provisional: the gross amount, before Chapa's fee is known.
        # `apps.refunds.tasks.process_refund` overwrites this with the
        # net figure (FR-REFUND-003) once it looks up the actual fee.
        amount_etb=gross_amount,
        reason=reason,
        requested_by_user_id=requested_by,
        note=note,
    )

    write_audit_log(
        actor_id=requested_by.id if requested_by else None,
        action="refund.requested",
        target_type="refund",
        target_id=refund.id,
        metadata={
            "booking_id": str(booking.id),
            "reason": reason,
            "gross_amount_etb": str(gross_amount),
        },
    )

    # Local import: apps.refunds.tasks imports this module, so importing
    # it back at module scope here would be circular -- deferred the same
    # way apps.payments.services locally imports apps.payments.tasks.
    from .tasks import process_refund

    process_refund.delay(refund_id=str(refund.id))
    return refund


# --------------------------------------------------------------------------
# FR-REFUND-001(a): Visitor cancellation
# --------------------------------------------------------------------------


def trigger_cancellation_refund(*, booking):
    """Implements FR-BOOK-006/FR-REFUND-001(a): "cancelling a Pending
    booking triggers a full, automatic refund." Called by the view layer
    (`apps.bookings.views.BookingCancelView`) right after
    `apps.bookings.services.cancel_booking` has already moved the booking
    to `Cancelled` -- never called from `bookings/services.py` itself
    (Design Spec Sec 3.2: `refunds` depends on `bookings`, not the
    reverse)."""
    return _create_refund_and_enqueue(booking=booking, reason=Refund.Reason.CANCELLATION)


# --------------------------------------------------------------------------
# FR-REFUND-001(b): partial-attendance shortfall request
# --------------------------------------------------------------------------


def request_partial_shortfall_refund(*, booking, visitor, note=None):
    """Implements `POST /bookings/{id}/refund-requests`
    (FR-TICKET-002, FR-REFUND-001b). Unlike the other two triggers, this
    one requires the Visitor to ask, and only succeeds against a
    `Visited` booking with a recorded, unrefunded shortfall
    (`attended_quantity < booked_quantity`)."""
    if booking.visitor_id != visitor.id:
        # Deliberately 403, not 404 -- mirrors
        # `apps.bookings.services._require_own_pending_booking`'s own
        # ownership-vs-existence distinction.
        raise PermissionDenied("This booking does not belong to you.")

    if (
        booking.status != Booking.Status.VISITED
        or booking.attended_quantity is None
        or booking.attended_quantity >= booking.booked_quantity
    ):
        raise Conflict("This booking has no refund-eligible shortfall.")

    return _create_refund_and_enqueue(
        booking=booking,
        reason=Refund.Reason.PARTIAL_SHORTFALL,
        requested_by=visitor,
        note=note,
    )


# --------------------------------------------------------------------------
# FR-REFUND-001(c): no-response auto-refund (FR-PAY-005 step 2)
# --------------------------------------------------------------------------


def trigger_no_response_refund(*, booking):
    """Implements FR-PAY-005/FR-REFUND-001(c). Called by
    `apps.bookings.tasks.check_no_response_refund` (Celery Beat, daily)
    for each `Pending` booking whose visit date has passed and whose
    no-show notice went unanswered for seven days."""
    return _create_refund_and_enqueue(booking=booking, reason=Refund.Reason.NO_RESPONSE)


# --------------------------------------------------------------------------
# Category correction (ID-verification addendum to Document 02 Sec 2.2)
# --------------------------------------------------------------------------


def trigger_category_correction_refund(*, booking, amount, actor):
    """Called by `apps.bookings.views.BookingCategoryCorrectionView` right
    after `apps.bookings.services.correct_booking_category` finds the
    visitor was overcharged (booked a pricier category than their ID
    supports) -- `amount` is that difference (`old_total - new_total`),
    computed by the caller from the booking's price fields *before* they
    were overwritten with the corrected values, since by the time this
    runs `booking.total_amount_etb` already reflects the new, lower
    total and can no longer be diffed against the old one on its own.
    This is why `_create_refund_and_enqueue` takes an explicit
    `amount_override` here instead of computing it itself the way the
    three FR-REFUND-001 triggers above do via `compute_refundable_amount`.

    Unlike `trigger_cancellation_refund`/`trigger_no_response_refund`,
    this never changes `booking.status` to `Refunded` --
    `apps.refunds.tasks.process_refund`'s own reason check already
    excludes `category_correction` from that (see its module docstring):
    the booking is still very much alive, mid check-in at the gate, not
    resolved."""
    return _create_refund_and_enqueue(
        booking=booking,
        reason=Refund.Reason.CATEGORY_CORRECTION,
        requested_by=actor,
        amount_override=amount,
    )


# --------------------------------------------------------------------------
# Listing (`GET /refunds`)
# --------------------------------------------------------------------------


def list_refunds(*, user, reason=None):
    """Implements `GET /refunds`: "Visitors see only their own; Staff can
    filter across all" (Document 04)."""
    queryset = Refund.objects.select_related("booking")
    if getattr(user, "role", None) == "visitor":
        queryset = queryset.filter(booking__visitor=user)
    if reason:
        queryset = queryset.filter(reason=reason)
    return queryset
