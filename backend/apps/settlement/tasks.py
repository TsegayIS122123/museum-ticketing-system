"""
settlement -- Celery tasks (queue: documents per Sec 6.1)

Cashier-initiated settlement transfer (FR-SETTLE-001-004): the Cashier
triggers this from the dashboard; nothing here runs on a schedule.
"""

from celery import shared_task


@shared_task(bind=True, max_retries=5)
def render_transfer_receipt(self, *, transfer_id):
    """Implements FR-SETTLE-002/004.

    Per ADR-009: rendered ONCE and stored at
    receipts/settlement/{transfer_id}.pdf -- never regenerated on demand.
    net_amount = sum(booking amounts) - sum(refunds since last transfer)
    (FR-REFUND-005) must already be computed before this task is enqueued.
    """
    raise NotImplementedError
