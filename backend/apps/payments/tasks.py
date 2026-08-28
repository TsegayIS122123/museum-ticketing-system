"""
payments -- Celery tasks (queue: documents / payments per Sec 6.1-6.2)

render_and_store_receipt lives here (triggered by payment confirmation);
settlement's own copy renders the Transfer Receipt (see
apps/settlement/tasks.py).
"""

from celery import shared_task


@shared_task(bind=True, max_retries=5)
def render_and_store_receipt(self, *, booking_id):
    """Implements FR-PAY-002, FR-LOC-002/003.

    Per ADR-009: rendered ONCE at issuance and stored in object storage at
    receipts/temporary/{booking_id}.pdf -- never regenerated on demand, so
    a template change later must not alter an already-issued receipt.
    """
    raise NotImplementedError
