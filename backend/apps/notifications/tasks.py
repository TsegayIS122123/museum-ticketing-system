"""
notifications -- Celery tasks (queue: notifications)

Per Design Spec Sec 6.1: kept off the request path (NFR-PERF-001).
Triggered by: booking confirmed, no-show notice, refund confirmed,
reschedule confirmed.

SMS is the primary OTP/notice channel (FR-ACC-001); email (magic link) is
a fallback verification path, not a substitute for a timely SMS OTP in the
booking flow -- see Document 08 Sec 5.2 alerting rationale.
"""

from celery import shared_task


@shared_task(bind=True, max_retries=5)
def send_notification(self, *, account_id, notification_type, context):
    """Implements: booking confirmed / no-show notice / refund confirmed /
    reschedule confirmed notifications, bilingual (FR-LOC)."""
    raise NotImplementedError
