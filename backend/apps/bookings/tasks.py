"""
bookings -- Celery Beat tasks (queue: scheduled/payments, exactly 1
Celery Beat replica -- Sec 8.1)

Both run daily and together implement the FR-PAY-005 no-response window
(Document 03 Sec 5.2's sequence diagram). A missed run means no-show
notices and no-response refunds silently stop (Document 08 Sec 5.1/5.2)
-- alerting on "did Beat run in the last 24h" matters as much as the task
logic itself.

Both checks are idempotent: a booking that is rescheduled or refunded
between runs no longer matches the `WHERE` clause on the next run, so no
explicit lock is needed beyond the status check itself (Document 03
Sec 5.2).
"""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

# FR-PAY-005: "if there is no response within one week" -- the gap
# between the notice (step 1) and the auto-refund (step 2).
_NO_RESPONSE_WINDOW = timedelta(days=7)


@shared_task
def check_pending_visit_date_passed():
    """FR-PAY-005 step 1: notice. Runs daily via Celery Beat.

    `SELECT bookings WHERE status=Pending AND visit_date < today AND
    notice_sent_at IS NULL` (Document 03 Sec 5.2) -- a booking is only
    ever noticed once; setting `notice_sent_at` here is what keeps a
    booking off this query on every subsequent day's run.
    """
    from apps.notifications.tasks import send_notification

    from .models import Booking

    today = timezone.localdate()
    now = timezone.now()

    candidates = Booking.objects.filter(
        status=Booking.Status.PENDING,
        visit_date__lt=today,
        notice_sent_at__isnull=True,
    )

    for booking in candidates:
        booking.notice_sent_at = now
        booking.save(update_fields=["notice_sent_at", "updated_at"])

        # Bilingual notice (email + SMS, email primary/default channel
        # per FR-PAY-005) -- off the request path, this task itself runs
        # off Celery Beat already, but the send is still its own job so a
        # slow SMS/email provider never blocks the sweep.
        send_notification.delay(
            account_id=str(booking.visitor_id),
            notification_type="no_show_notice",
            context={
                "booking_id": str(booking.id),
                "reference": booking.reference,
                "visit_date": booking.visit_date.isoformat(),
            },
        )


@shared_task
def check_no_response_refund():
    """FR-PAY-005 step 2 / FR-REFUND-001(c): auto-refund. Runs daily via
    Celery Beat.

    `SELECT bookings WHERE status=Pending AND notice_sent_at <= now() - 7
    days` (Document 03 Sec 5.2). The actual refund -- creating the
    `Refund` record and handing the Chapa call to
    `apps.refunds.tasks.process_refund` -- is `apps.refunds`' job
    (Design Spec Sec 3.2: `refunds` depends on `bookings`, not the
    reverse); this task only identifies which bookings qualify and
    composes the two apps, the same role a view layer plays for a
    synchronous request (see `apps.bookings.views.BookingCancelView`'s
    identical local-import rationale).
    """
    from apps.refunds.services import trigger_no_response_refund

    from .models import Booking

    deadline = timezone.now() - _NO_RESPONSE_WINDOW

    candidates = Booking.objects.filter(
        status=Booking.Status.PENDING,
        notice_sent_at__isnull=False,
        notice_sent_at__lte=deadline,
    )

    for booking in candidates:
        trigger_no_response_refund(booking=booking)
