"""
settlement -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests -- the actual Chapa HTTP call is isolated in
`call_chapa_transfer_api` below so tests can monkeypatch/mock exactly that
function instead of the network (mirrors `apps.refunds.services`'s own
isolation of `call_chapa_refund_api`).

Per the IFMIS decision (see docs/ decision summary) and the accompanying
build prompt: this is a *per-cashier* ledger, never a platform-wide batch.
Whoever checked a visitor in personally enters that transaction into
IFMIS under her own name, so everything here is scoped to one cashier at
a time -- `get_outstanding_balance` and `initiate_reconciliation` both
take a single `cashier` and never aggregate across cashiers.

Settling up is a real transfer (Chapa's Transfer API moving the cashier's
share of the pooled merchant balance into the university's fixed bank
account). This module renders no artifact for the Visitor -- the IFMIS
vouchers she has already collected from her shift's visitors
(`Booking.ifmis_voucher_reference`) remain the only audit trail Finance
uses for what she owes.

It DOES render one artifact for the Cashier herself, though:
`confirm_reconciliation_success` enqueues
`tasks.render_and_store_transfer_receipt`, a bilingual PDF proving the
transfer happened. This mirrors the manual process it replaces -- a
Cashier depositing cash at a bank walks away with a paper deposit slip,
and that slip (not anything from IFMIS) is what she hands Finance to
reconcile. Chapa's Transfer API moving money is not, on its own, proof
she can carry anywhere; this module's transfer receipt is that proof's
digital equivalent.
"""

import logging
from decimal import Decimal

import requests
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from apps.bookings.models import Booking
from apps.core.services import write_audit_log
from apps.refunds.models import Refund

from .models import CashierReconciliation

logger = logging.getLogger(__name__)

CHAPA_BASE_URL = "https://api.chapa.co/v1"
CHAPA_TIMEOUT_SECONDS = 15


class SettlementGatewayError(APIException):
    """The Chapa API itself is unreachable or returned an error -- distinct
    from `ValidationError` (nothing to reconcile): this is an upstream
    dependency failure. Mirrors `apps.refunds.services.RefundGatewayError`.
    """

    status_code = 502
    default_detail = "Could not reach the payment provider. Please try again."
    default_code = "settlement_gateway_error"


# --------------------------------------------------------------------------
# Shared querysets -- one cashier's outstanding bookings/refunds
# --------------------------------------------------------------------------


def _outstanding_bookings_queryset(*, cashier):
    """Every `Visited` booking this cashier checked in that hasn't yet been
    swept into a *completed* reconciliation -- exactly the condition the
    `booking_visited_unrecon_idx` partial index (apps.bookings, Step 1) is
    built for."""
    return Booking.objects.filter(
        checked_in_by_user_id=cashier,
        status=Booking.Status.VISITED,
        reconciliation__isnull=True,
    )


def _undeducted_refunds_queryset(*, cashier):
    """Completed refunds against this cashier's own checked-in bookings
    that haven't yet been netted off a reconciliation -- scoped through
    `booking__checked_in_by_user_id` so two cashiers' refunds never cross
    into each other's balance."""
    return Refund.objects.filter(
        booking__checked_in_by_user_id=cashier,
        status=Refund.Status.COMPLETED,
        deducted_in_transfer_id__isnull=True,
    )


# --------------------------------------------------------------------------
# 1. Outstanding balance (read-only -- "my balance" screen)
# --------------------------------------------------------------------------


def get_outstanding_balance(*, cashier):
    """Implements `GET /settlement/my-balance/`. Sums this cashier's
    unreconciled `Visited` bookings, minus her unreconciled completed
    refunds -- never a shared, platform-wide total (per the IFMIS
    decision). Read-only: takes no lock, so the figure can move between
    this call and a subsequent `initiate_reconciliation` -- that function
    recomputes it under a lock rather than trusting this value.

    DECIDED (contract-audit finding, docs/ifmis-decision-summary.md): no
    itemized bookings/refunds breakdown endpoint is planned alongside
    this aggregate. The Cashier's own IFMIS vouchers -- handed out one
    per visitor at check-in, `apps.entrance` -- are already her itemized
    record for Finance; this endpoint only needs to give her the one
    number she's about to send in one click (`initiate_reconciliation`
    below), not a line-by-line reproduction of a paper trail she already
    keeps.
    """
    booked_total = _outstanding_bookings_queryset(cashier=cashier).aggregate(
        total=Sum("total_amount_etb")
    )["total"] or Decimal("0")
    refunded_total = _undeducted_refunds_queryset(cashier=cashier).aggregate(
        total=Sum("amount_etb")
    )["total"] or Decimal("0")
    return booked_total - refunded_total


# --------------------------------------------------------------------------
# 2. Chapa Transfer API call (isolated so tests mock this, not requests)
# --------------------------------------------------------------------------


def call_chapa_transfer_api(*, amount, reference):
    """Calls Chapa's Transfer API (`POST /v1/transfers`) to move `amount`
    out of Chapa's pooled merchant balance into AAU's fixed bank account
    (`FINANCE_BANK_ACCOUNT_NAME`/`_NUMBER`/`FINANCE_BANK_CODE`, Step 8).

    `reference` is our own `CashierReconciliation.id`, passed through as
    Chapa's `reference` param (mirrors
    `apps.refunds.services.call_chapa_refund_api`'s use of `Refund.id`) so
    a duplicate/retried call is traceable back to the same row on Chapa's
    side, and so `GET /v1/transfers/verify/<reference>` can be polled
    against it later if a webhook turns out not to be available (Step 6).

    Returns the reference Chapa will recognize this transfer by for
    future verification -- Chapa echoes back the `reference` it settled
    on (either the one we sent, or one it generated itself if we hadn't
    supplied one); since we always supply our own, this is normally the
    same value passed in, but it's read from the response rather than
    assumed, in case Chapa ever normalizes it.

    Raises `SettlementGatewayError` on any non-2xx response, a malformed
    body, or a body that doesn't report success -- this is a money-moving
    call, so it never fails silently or guesses a reference.
    """
    payload = {
        "account_name": settings.FINANCE_BANK_ACCOUNT_NAME,
        "account_number": settings.FINANCE_BANK_ACCOUNT_NUMBER,
        "bank_code": settings.FINANCE_BANK_CODE,
        "amount": str(amount),
        "currency": "ETB",
        "reference": str(reference),
    }
    try:
        response = requests.post(
            f"{CHAPA_BASE_URL}/transfers",
            json=payload,
            headers={"Authorization": f"Bearer {settings.CHAPA_SECRET_KEY}"},
            timeout=CHAPA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Chapa transfer initiation failed for reference %s", reference)
        raise SettlementGatewayError() from exc

    if body.get("status") != "success":
        logger.error("Chapa transfer returned an unexpected response for %s: %s", reference, body)
        raise SettlementGatewayError()

    # Chapa's docs don't guarantee a single field name for the echoed
    # reference across every response shape -- fall back to the reference
    # we sent (which is always present, since we always supply one) if
    # the body doesn't surface it under `data.reference`.
    transfer_reference = (body.get("data") or {}).get("reference") or str(reference)
    return transfer_reference


# --------------------------------------------------------------------------
# 3. Initiate a reconciliation (the one-click action)
# --------------------------------------------------------------------------


def initiate_reconciliation(*, cashier):
    """Implements `POST /settlement/reconcile/`. Locks this cashier's
    outstanding bookings/refunds, recomputes her balance under that lock,
    and creates a `PENDING` reconciliation row for it -- all in one short
    transaction. That transaction is committed (and the row locks
    released) *before* calling Chapa: holding row locks for the duration
    of an external HTTP call would block every other read of this
    cashier's balance for as long as Chapa takes to respond, and it isn't
    needed for correctness here since nothing else reads/writes
    `reconciliation`/`deducted_in_transfer_id` on these rows until
    `confirm_reconciliation_success` runs.

    Does NOT mark any booking/refund as reconciled yet -- that only
    happens once the transfer is confirmed successful
    (`confirm_reconciliation_success`), so a transfer that later fails or
    never confirms leaves every booking/refund eligible for the next
    attempt untouched.
    """
    with transaction.atomic():
        locked_bookings = list(
            _outstanding_bookings_queryset(cashier=cashier).select_for_update()
        )
        locked_refunds = list(
            _undeducted_refunds_queryset(cashier=cashier).select_for_update()
        )

        booked_total = sum((b.total_amount_etb for b in locked_bookings), Decimal("0"))
        refunded_total = sum((r.amount_etb for r in locked_refunds), Decimal("0"))
        balance = booked_total - refunded_total

        if balance <= 0:
            raise ValidationError("Nothing to reconcile.")

        reconciliation = CashierReconciliation.objects.create(
            cashier=cashier,
            amount_etb=balance,
            status=CashierReconciliation.Status.PENDING,
            initiated_at=timezone.now(),
        )
    # The lock-holding transaction above has now committed -- `balance`
    # and `reconciliation` are durable regardless of what happens next.

    try:
        transfer_reference = call_chapa_transfer_api(
            amount=balance, reference=reconciliation.id
        )
    except Exception as exc:
        # The Chapa call itself failed synchronously -- don't leave a
        # dangling PENDING row for a transfer that never actually went
        # out. This save is its own transaction (we're no longer inside
        # the `atomic()` block above), so it persists even though we
        # re-raise right after -- if it were still inside that block,
        # the re-raise would roll this write back too. The underlying
        # bookings/refunds were locked but never written to, so they
        # remain eligible for the next attempt.
        reconciliation.status = CashierReconciliation.Status.FAILED
        reconciliation.failure_reason = str(exc)
        reconciliation.save(update_fields=["status", "failure_reason", "updated_at"])
        raise

    reconciliation.chapa_transfer_reference = transfer_reference
    reconciliation.save(update_fields=["chapa_transfer_reference", "updated_at"])
    return reconciliation


# --------------------------------------------------------------------------
# 4. Confirm success (webhook/poll, Step 6)
# --------------------------------------------------------------------------


@transaction.atomic
def confirm_reconciliation_success(*, reconciliation):
    """Called once Chapa confirms the transfer went through. Marks the
    reconciliation `COMPLETED`, then atomically attributes every
    `Visited`, still-unreconciled booking checked in by this cashier (and
    every completed, undeducted refund against those same bookings) to
    it -- this is the only point in the whole flow where
    `Booking.reconciliation` / `Refund.deducted_in_transfer_id` are ever
    set.

    Also enqueues `render_and_store_transfer_receipt`: the Cashier's own
    proof that this transfer happened, which she carries to Finance
    alongside her IFMIS vouchers (the digital equivalent of the paper
    deposit slip a bank hands her in the manual process). Only enqueued
    here, on the COMPLETED path -- a FAILED transfer has nothing to
    prove.
    """
    reconciliation.status = CashierReconciliation.Status.COMPLETED
    reconciliation.completed_at = timezone.now()
    reconciliation.save(update_fields=["status", "completed_at", "updated_at"])

    bookings = list(
        _outstanding_bookings_queryset(cashier=reconciliation.cashier).select_for_update()
    )
    for booking in bookings:
        booking.reconciliation = reconciliation
    Booking.objects.bulk_update(bookings, ["reconciliation"])

    refunds = list(
        _undeducted_refunds_queryset(cashier=reconciliation.cashier).select_for_update()
    )
    for refund in refunds:
        refund.deducted_in_transfer_id = reconciliation
    Refund.objects.bulk_update(refunds, ["deducted_in_transfer_id"])

    # Off the request path (NFR-PERF-001), mirroring
    # apps.payments.services.confirm_payment_from_webhook's own choice to
    # only enqueue rendering, never render synchronously inside a webhook
    # handler.
    from .tasks import render_and_store_transfer_receipt

    render_and_store_transfer_receipt.delay(reconciliation_id=str(reconciliation.id))

    write_audit_log(
        actor_id=None,
        action="settlement.reconciliation_completed",
        target_type="cashier_reconciliation",
        target_id=reconciliation.id,
        metadata={
            "cashier_id": str(reconciliation.cashier_id),
            "amount_etb": str(reconciliation.amount_etb),
            "booking_count": len(bookings),
            "refund_count": len(refunds),
            "chapa_transfer_reference": reconciliation.chapa_transfer_reference,
        },
    )
    return reconciliation


# --------------------------------------------------------------------------
# 5. Confirm failure (webhook/poll, Step 6)
# --------------------------------------------------------------------------


def confirm_reconciliation_failure(*, reconciliation, reason):
    """Called once Chapa reports the transfer failed. Nothing else
    changes -- the underlying bookings/refunds were never locked into
    this reconciliation (only `confirm_reconciliation_success` does
    that), so they're simply eligible again for the cashier's next
    reconciliation attempt.
    """
    reconciliation.status = CashierReconciliation.Status.FAILED
    reconciliation.failure_reason = reason
    reconciliation.save(update_fields=["status", "failure_reason", "updated_at"])
    return reconciliation


# --------------------------------------------------------------------------
# 6. List reconciliations (Step 5 -- GET /settlement/reconciliations/)
# --------------------------------------------------------------------------


def list_reconciliations(*, user):
    """Implements `GET /settlement/reconciliations/`: a Cashier sees only
    her own attempts; Museum Manager/Platform Admin see every cashier's --
    mirrors `apps.refunds.services.list_refunds`'s own role-based scoping
    (a Visitor there, a Cashier here, is the only role narrowed down to
    "own rows only")."""
    queryset = CashierReconciliation.objects.select_related("cashier")
    if getattr(user, "role", None) == "cashier":
        queryset = queryset.filter(cashier=user)
    return queryset


# --------------------------------------------------------------------------
# 7. Chapa transfer webhook (Step 5 -- POST /settlement/webhook/chapa-transfer/)
# --------------------------------------------------------------------------


@transaction.atomic
def handle_chapa_transfer_webhook(*, payload):
    """Routes a signature-verified Chapa Transfer (Payout) webhook payload
    (Document: https://developer.chapa.co/integrations/webhooks -- `"type":
    "Payout"` events) to `confirm_reconciliation_success` or
    `confirm_reconciliation_failure`.

    Looks the row up by `reference`, not `chapa_reference`: `reference` is
    the value *we* originally supplied to `call_chapa_transfer_api`
    (`str(reconciliation.id)`), which Chapa's webhook echoes back
    unchanged -- `chapa_reference` is Chapa's own internal id for the
    transfer and was never something we chose or can look our row up by.

    Safe to call more than once for the same `reference` (a replayed or
    duplicate webhook delivery): a reconciliation that has already left
    `PENDING` is a no-op here, mirroring
    `apps.payments.services.confirm_payment_from_webhook`'s own
    idempotency guarantee (NFR-IDEMPOTENT-001) -- neither
    `confirm_reconciliation_success` nor `_failure` is re-run against an
    already-COMPLETED/FAILED row.
    """
    reference = payload.get("reference")
    if not reference:
        raise ValidationError({"reference": "Required."})

    try:
        reconciliation = CashierReconciliation.objects.select_for_update().get(id=reference)
    except (CashierReconciliation.DoesNotExist, ValueError, DjangoValidationError):
        raise ValidationError({"reference": "Unknown reconciliation reference."})

    if reconciliation.status != CashierReconciliation.Status.PENDING:
        return reconciliation

    status_value = (payload.get("status") or payload.get("event") or "").lower()
    if "success" in status_value:
        return confirm_reconciliation_success(reconciliation=reconciliation)

    reason = payload.get("failure_reason") or f"Chapa reported transfer status: {status_value or 'unknown'}."
    return confirm_reconciliation_failure(reconciliation=reconciliation, reason=reason)