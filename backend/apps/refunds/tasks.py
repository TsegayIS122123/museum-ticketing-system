"""
refunds -- Celery tasks (queue: payments per Sec 6.1-6.2)

Watched most closely per Document 08 Sec 5.1 -- this queue also carries
the settlement-transfer Chapa call.
"""

from celery import shared_task


@shared_task(bind=True, max_retries=5)
def process_refund(self, *, refund_id):
    """Implements FR-REFUND-001-004 (Visitor cancellation, shortfall
    request, or no-response auto-refund).

    Per ADR-008: calls Chapa's refund API against the original tx_ref.
    Per NFR-IDEMPOTENT-001/NFR-CONSIST-001: MUST check an "already
    processed" DB flag before calling Chapa, so a retried job cannot
    double-refund.
    """
    raise NotImplementedError
