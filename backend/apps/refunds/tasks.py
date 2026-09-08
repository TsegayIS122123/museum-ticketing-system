"""
refunds -- Celery tasks (queue: payments per Sec 6.1-6.2)

Watched most closely per Document 08 Sec 5.1 -- this queue also carries
the settlement-transfer Chapa call.
"""

import logging
from decimal import Decimal

from celery import shared_task
from django.db import transaction

logger = logging.getLogger(__name__)

# A nominal floor so `Refund.amount_etb`'s `CHECK (amount_etb > 0)`
# constraint (Document 05 Sec 3.5) can never be violated by a pathological
# fee quote (fee >= gross amount) -- this should not happen in practice,
# since Chapa's own fee is always a small fraction of the transaction, but
# a money-moving job fails loudly rather than silently violating a
# database invariant.
_MINIMUM_REFUND_AMOUNT_ETB = Decimal("0.01")


# `ignore_result=True`: this task is always fired with `.delay()` and
# never awaited via `.get()` anywhere in the codebase, so nothing needs
# its return value stored. That matters here specifically because the
# function returns a `Refund` model instance below -- Celery's
# django-db/JSON result backend has no encoder for that, so without
# `ignore_result` the task raises `EncodeError` at the *result-storage*
# step, after the refund itself (Chapa call, Refund row, booking status,
# audit log, notification) has already fully committed. That looked like
# "the refund silently failed" in the worker log even though it hadn't --
# ignoring the result removes the storage step (and the crash) entirely
# without changing what the task actually does.
@shared_task(bind=True, max_retries=5, ignore_result=True)
def process_refund(self, *, refund_id):
    """Implements FR-REFUND-001-004 (Visitor cancellation, shortfall
    request, or no-response auto-refund).

    Per ADR-008: calls Chapa's refund API against the original tx_ref.
    Per NFR-IDEMPOTENT-001/NFR-CONSIST-001: checks the "already
    processed" DB flag (`Refund.status`) before calling Chapa, so a
    retried job cannot double-refund.

    Two Chapa calls, in order:
      1. `services.fetch_chapa_transaction_fee` -- reads back what Chapa
         actually charged on the original payment, so the refund can be
         netted correctly (FR-REFUND-003), never assumed.
      2. `services.call_chapa_refund_api` -- initiates the refund itself,
         for the net (gross minus fee) amount.
    """
    # Local imports: avoids a Django app-loading-order import at
    # task-module import time, and avoids the circular import that a
    # module-level `from .services import ...` would create (services.py
    # imports this module's `process_refund` to enqueue it).
    from apps.bookings.models import Booking
    from apps.core.services import write_audit_log

    from . import services
    from .models import Refund

    try:
        refund = Refund.objects.select_related("booking", "payment").get(id=refund_id)
    except Refund.DoesNotExist:
        # Nothing sensible to retry -- the refund this task was enqueued
        # for no longer exists.
        logger.error("process_refund: refund %s not found", refund_id)
        return

    if refund.status != Refund.Status.PENDING:
        # Already completed by an earlier run of this same task, or
        # already given up on (failed) -- either way, a retried/duplicate
        # job must be a no-op, not a second Chapa call.
        return

    gross_amount = refund.amount_etb  # set provisionally at creation (services._create_refund_and_enqueue)
    tx_ref = refund.payment.tx_ref

    try:
        fee = services.fetch_chapa_transaction_fee(tx_ref=tx_ref)
        net_amount = gross_amount - fee
        if net_amount < _MINIMUM_REFUND_AMOUNT_ETB:
            net_amount = _MINIMUM_REFUND_AMOUNT_ETB
        chapa_refund_reference = services.call_chapa_refund_api(
            tx_ref=tx_ref,
            amount=net_amount,
            reason=refund.reason,
            reference=str(refund.id),
        )
    except services.RefundGatewayError as exc:
        logger.exception("process_refund: Chapa call failed for refund %s", refund_id)
        try:
            raise self.retry(exc=exc, countdown=min(60 * (2**self.request.retries), 900))
        except self.MaxRetriesExceededError:
            refund.status = Refund.Status.FAILED
            refund.save(update_fields=["status", "updated_at"])
            write_audit_log(
                actor_id=None,
                action="refund.failed",
                target_type="refund",
                target_id=refund.id,
                metadata={"booking_id": str(refund.booking_id), "reason": refund.reason},
            )
            raise

    with transaction.atomic():
        refund.aggregator_fee_etb = fee
        refund.amount_etb = net_amount
        refund.chapa_refund_reference = chapa_refund_reference
        refund.status = Refund.Status.COMPLETED
        refund.save(
            update_fields=[
                "aggregator_fee_etb",
                "amount_etb",
                "chapa_refund_reference",
                "status",
                "updated_at",
            ]
        )

        booking = refund.booking
        if refund.reason in (Refund.Reason.CANCELLATION, Refund.Reason.NO_RESPONSE):
            # FR-PAY-005/FR-BOOK-006: the booking's final status becomes
            # Refunded. A partial_shortfall refund does NOT change
            # booking.status -- the booking is already resolved
            # (Visited); the refund is just for the unattended portion.
            # A category_correction refund (ID-verification addendum)
            # doesn't either, for the opposite reason: the booking isn't
            # resolved yet at all -- this refund fires mid check-in, for
            # an overcharge found at the gate, while the booking is still
            # very much `Pending`.
            booking.status = Booking.Status.REFUNDED
            booking.save(update_fields=["status", "updated_at"])

        write_audit_log(
            actor_id=refund.requested_by_user_id_id,
            action="refund.issued",
            target_type="refund",
            target_id=refund.id,
            metadata={
                "booking_id": str(booking.id),
                "reason": refund.reason,
                "amount_etb": str(net_amount),
                "aggregator_fee_etb": str(fee),
                "chapa_refund_reference": chapa_refund_reference,
            },
        )

    # Off the request/task-critical path (NFR-PERF-001) -- notification
    # dispatch never blocks the refund itself.
    from apps.notifications.tasks import send_notification

    send_notification.delay(
        account_id=str(refund.booking.visitor_id),
        notification_type="refund_confirmed",
        context={
            "booking_id": str(refund.booking_id),
            "refund_id": str(refund.id),
            "amount_etb": str(net_amount),
        },
    )

    return refund
