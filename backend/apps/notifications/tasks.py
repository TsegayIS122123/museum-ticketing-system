"""
notifications -- Celery tasks (queue: notifications, per Design Spec Sec 6.2)

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
  - "booking_payment_confirmed": {"booking_id", "reference"}
  - "no_show_notice": {"booking_id", "reference", "visit_date"}
  - "refund_confirmed": {"booking_id", "refund_id", "amount_etb"}
  - "reschedule_confirmed": {"booking_id", "reference", "new_visit_date"} (TBD --
    no caller yet; apps.notifications.services degrades gracefully if a key
    is missing)
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=5)
def send_notification(self, *, account_id, notification_type, context, notification_id=None):
    """Implements: booking confirmed / no-show notice / refund confirmed /
    reschedule confirmed / visitor OTP / visitor email verification / staff
    password reset notifications, bilingual (FR-LOC).

    Idempotency (mirrors `apps.refunds.tasks.process_refund`'s "already
    processed" DB check, adapted for a fan-out-to-channels job): the
    `Notification` + `NotificationDelivery` rows are created exactly once,
    on the first attempt. A Celery retry re-invokes this function with
    `notification_id` set (via `self.retry(kwargs=...)` below), so it
    fetches the existing rows instead of creating duplicates, and
    `services.send_pending_deliveries` skips any channel already marked
    `sent` -- so a retried send never doubles-up a channel that already
    succeeded, only resumes the ones that hadn't.
    """
    # Local imports: avoids a Django app-loading-order import at
    # task-module import time (mirrors apps.refunds.tasks/apps.bookings.tasks).
    from apps.accounts.models import Account

    from . import services
    from .models import Notification

    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        # Nothing sensible to retry -- the account this task was enqueued
        # for no longer exists.
        logger.error("send_notification: account %s not found", account_id)
        return

    if notification_id:
        notification = Notification.objects.get(id=notification_id)
    else:
        notification = services.record_notification(
            account=account, notification_type=notification_type, context=context
        )

    try:
        services.send_pending_deliveries(notification=notification, context=context)
    except services.NotificationDeliveryError as exc:
        try:
            raise self.retry(
                exc=exc,
                countdown=min(60 * (2**self.request.retries), 900),
                kwargs={
                    "account_id": account_id,
                    "notification_type": notification_type,
                    "context": context,
                    "notification_id": str(notification.id),
                },
            )
        except self.MaxRetriesExceededError:
            services.mark_stalled_deliveries_failed(
                notification=notification, error_message=str(exc)
            )
            return

    return str(notification.id)
