"""
bookings -- Celery Beat tasks (queue: scheduled/payments, exactly 1
Celery Beat replica -- Sec 8.1)

Both run daily and together implement the FR-PAY-005 no-response window.
A missed run means no-show notices and no-response refunds silently stop
(Document 08 Sec 5.1/5.2) -- alerting on "did Beat run in the last 24h"
matters as much as the task logic itself.
"""

from celery import shared_task


@shared_task
def check_pending_visit_date_passed():
    """FR-PAY-005 step 1: notice. Runs daily via Celery Beat."""
    raise NotImplementedError


@shared_task
def check_no_response_refund():
    """FR-PAY-005 step 2: auto-refund. Runs daily via Celery Beat."""
    raise NotImplementedError
