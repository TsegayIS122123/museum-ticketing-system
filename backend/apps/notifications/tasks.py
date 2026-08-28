"""
notifications -- Celery tasks (queue: notifications)

Per Design Spec Sec 6.1: kept off the request path (NFR-PERF-001).
Triggered by: booking confirmed, no-show notice, refund confirmed,
reschedule confirmed, and (apps.accounts.services, Sec 4.1) visitor_otp,
visitor_email_verification, staff_password_reset.

SMS is the primary OTP/notice channel (FR-ACC-001); email (magic link) is
a fallback verification path, not a substitute for a timely SMS OTP in the
booking flow -- see Document 08 Sec 5.2 alerting rationale.

`notification_type` -> expected `context` keys, as called today:
  - "visitor_otp": {"otp_code", "expires_in_seconds"}
  - "visitor_email_verification": {"verification_token"}
  - "staff_password_reset": {"reset_token"}
  - booking/refund/reschedule types: TBD when apps.bookings/refunds land.
"""

from celery import shared_task


@shared_task(bind=True, max_retries=5)
def send_notification(self, *, account_id, notification_type, context):
    """Implements: booking confirmed / no-show notice / refund confirmed /
    reschedule confirmed / visitor OTP / visitor email verification / staff
    password reset notifications, bilingual (FR-LOC)."""
    raise NotImplementedError