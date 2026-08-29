"""
notifications -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests -- the actual email/SMS I/O is isolated in
`_send_email`/`_send_sms` below so tests can monkeypatch/mock exactly
those, the same pattern `apps.payments._initialize_chapa_checkout` uses
for Chapa.

Two entry points, called by `tasks.send_notification`:

- `record_notification` -- creates the `Notification` event row plus one
  `NotificationDelivery` row per channel (Sec 6.4: e.g. FR-PAY-005's
  no-show notice fans out to both email and SMS). Called at most once per
  logical notification -- a Celery retry passes the already-created
  `notification_id` back in so this is never called twice for the same
  event (see tasks.py).
- `send_pending_deliveries` -- attempts the actual send for every
  not-yet-`sent` delivery on a notification. Idempotent by construction:
  a delivery already marked `sent` is simply skipped, so a retried task
  never double-sends a channel that already succeeded.

Per Design Spec Sec 6.4: every notice is bilingual (English and Amharic
together), not machine-translated and not chosen from the Visitor's
`language_preference` -- the same "both languages, always" rule the
design spec applies to generated documents.
"""

import logging

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Notification, NotificationDelivery

logger = logging.getLogger(__name__)

SMS_GATEWAY_TIMEOUT_SECONDS = getattr(settings, "SMS_GATEWAY_TIMEOUT_SECONDS", 10)

# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------


class NotificationDeliveryError(Exception):
    """Raised by `send_pending_deliveries` when one or more channels failed
    on this attempt. Caught by `tasks.send_notification`, which decides
    whether to retry (Design Spec Sec 6.1) or, on final exhaustion, mark
    the still-pending deliveries `failed`."""


class _ChannelSendError(Exception):
    """Internal: raised by a single `_send_email`/`_send_sms` call. Never
    escapes `send_pending_deliveries`, which aggregates these into a
    single `NotificationDeliveryError`."""


# --------------------------------------------------------------------------
# Channel selection -- which channel(s) a given notification_type fans out
# to (Document 05 Sec 3.9's `notification_delivery` table).
# --------------------------------------------------------------------------

NotificationType = Notification.NotificationType

# SMS is the primary channel for anything time-critical to the booking
# flow itself (FR-ACC-001); email is the fallback/secondary channel
# everywhere else, per Document 08 Sec 5.2's alerting rationale.
NOTIFICATION_CHANNELS = {
    NotificationType.VISITOR_OTP: [NotificationDelivery.Channel.SMS],
    NotificationType.VISITOR_EMAIL_VERIFICATION: [NotificationDelivery.Channel.EMAIL],
    NotificationType.STAFF_PASSWORD_RESET: [NotificationDelivery.Channel.EMAIL],
    NotificationType.BOOKING_PAYMENT_CONFIRMED: [
        NotificationDelivery.Channel.EMAIL,
        NotificationDelivery.Channel.SMS,
    ],
    # FR-PAY-005 explicitly requires both channels for the no-show notice.
    NotificationType.NO_SHOW_NOTICE: [
        NotificationDelivery.Channel.EMAIL,
        NotificationDelivery.Channel.SMS,
    ],
    NotificationType.REFUND_CONFIRMED: [NotificationDelivery.Channel.EMAIL],
    NotificationType.RESCHEDULE_CONFIRMED: [
        NotificationDelivery.Channel.EMAIL,
        NotificationDelivery.Channel.SMS,
    ],
    NotificationType.GROUP_BOOKING_DECIDED: [NotificationDelivery.Channel.EMAIL],
}

# A notification_type not yet wired above (e.g. a future module) still
# gets *something* sent rather than silently dropped -- email only, since
# that's the safer default channel (never the higher-cost/urgency SMS
# channel for an unrecognized type).
_DEFAULT_CHANNELS = [NotificationDelivery.Channel.EMAIL]


def _channels_for(notification_type):
    return NOTIFICATION_CHANNELS.get(notification_type, _DEFAULT_CHANNELS)


# --------------------------------------------------------------------------
# Bilingual content (FR-LOC-001/002, Design Spec Sec 6.4) -- one function
# per notification_type, each returning independently-authored English and
# Amharic copy (never a runtime translation of the other).
# --------------------------------------------------------------------------


def _otp_content(context):
    minutes = max(1, int(context["expires_in_seconds"]) // 60)
    return {
        "subject": {"en": "Your verification code", "am": "የማረጋገጫ ኮድዎ"},
        "body": {
            "en": (
                f"Your Museum Ticketing verification code is {context['otp_code']}. "
                f"It expires in {minutes} minutes. Do not share this code with anyone."
            ),
            "am": (
                f"የቲኬት ማረጋገጫ ኮድዎ {context['otp_code']} ነው። "
                f"በ{minutes} ደቂቃዎች ውስጥ ጊዜው ያልፋል። ይህን ኮድ ለማንም አያካፍሉ።"
            ),
        },
    }


def _email_verification_content(context):
    link = (
        f"{settings.PUBLIC_WEB_BASE_URL.rstrip('/')}/verify-email"
        f"?token={context['verification_token']}"
    )
    return {
        "subject": {"en": "Verify your email address", "am": "የኢሜይል አድራሻዎን ያረጋግጡ"},
        "body": {
            "en": f"Confirm your email address for Museum Ticketing by visiting: {link}",
            "am": f"የኢሜይል አድራሻዎን ለማረጋገጥ እባክዎ ይህን ሊንክ ይጎብኙ: {link}",
        },
    }


def _staff_password_reset_content(context):
    link = (
        f"{settings.PUBLIC_WEB_BASE_URL.rstrip('/')}/reset-password"
        f"?token={context['reset_token']}"
    )
    return {
        "subject": {"en": "Reset your password", "am": "የይለፍ ቃልዎን ዳግም ያስጀምሩ"},
        "body": {
            "en": (
                f"A password reset was requested for your Museum Ticketing staff "
                f"account. Visit {link} to choose a new password. If you did not "
                f"request this, you can ignore this message."
            ),
            "am": (
                f"ለሰራተኛ መለያዎ የይለፍ ቃል ዳግም ማስጀመሪያ ተጠይቋል። አዲስ የይለፍ ቃል "
                f"ለመምረጥ {link} ይጎብኙ። ይህን ካልጠየቁ፣ ይህን መልእክት ችላ ማለት ይችላሉ።"
            ),
        },
    }


def _booking_payment_confirmed_content(context):
    return {
        "subject": {"en": "Booking confirmed", "am": "ቦታ ማስያዝ ተረጋግጧል"},
        "body": {
            "en": (
                f"Your booking {context['reference']} is confirmed. Please keep this "
                f"reference for entry."
            ),
            "am": (
                f"ቦታ ማስያዝዎ {context['reference']} ተረጋግጧል። እባክዎ ይህን ማጣቀሻ ቁጥር "
                f"ለመግቢያ ያስቀምጡ።"
            ),
        },
    }


def _no_show_notice_content(context):
    return {
        "subject": {"en": "You missed your visit date", "am": "የጉብኝት ቀንዎ አልፏል"},
        "body": {
            "en": (
                f"Booking {context['reference']} for {context['visit_date']} was not "
                f"attended. If we do not hear from you within 7 days, an automatic "
                f"refund will be issued."
            ),
            "am": (
                f"ቦታ ማስያዝ {context['reference']} ለ{context['visit_date']} አልተከናወነም። "
                f"በ7 ቀናት ውስጥ ምላሽ ካልሰጡ፣ ራስ-ሰር ተመላሽ ገንዘብ ይሰጣል።"
            ),
        },
    }


def _refund_confirmed_content(context):
    return {
        "subject": {"en": "Refund issued", "am": "ተመላሽ ገንዘብ ተልኳል"},
        "body": {
            "en": (
                f"A refund of {context['amount_etb']} ETB has been issued for "
                f"booking {context['booking_id']}."
            ),
            "am": (
                f"ለቦታ ማስያዝ {context['booking_id']} የ{context['amount_etb']} ብር ተመላሽ "
                f"ገንዘብ ተልኳል።"
            ),
        },
    }


def _reschedule_confirmed_content(context):
    reference = context.get("reference", context.get("booking_id", ""))
    new_visit_date = context.get("new_visit_date", "")
    return {
        "subject": {"en": "Booking rescheduled", "am": "ቦታ ማስያዝ ቀን ተቀይሯል"},
        "body": {
            "en": f"Booking {reference} has been rescheduled to {new_visit_date}.",
            "am": f"ቦታ ማስያዝ {reference} ወደ {new_visit_date} ተቀይሯል።",
        },
    }


def _group_booking_decided_content(context):
    reference = context.get("reference", context.get("booking_id", ""))
    decision = context.get("decision", "")
    return {
        "subject": {"en": "Group booking update", "am": "የቡድን ቦታ ማስያዝ ዝማኔ"},
        "body": {
            "en": f"Your group booking {reference} was {decision}.",
            "am": f"የቡድን ቦታ ማስያዝዎ {reference} {decision} ነው።",
        },
    }


def _fallback_content(notification_type, context):
    return {
        "subject": {"en": "Museum Ticketing notification", "am": "የቲኬት ማሳወቂያ"},
        "body": {
            "en": f"Notification: {notification_type}. Details: {context}",
            "am": f"ማሳወቂያ: {notification_type}። ዝርዝሮች: {context}",
        },
    }


_CONTENT_BUILDERS = {
    NotificationType.VISITOR_OTP: _otp_content,
    NotificationType.VISITOR_EMAIL_VERIFICATION: _email_verification_content,
    NotificationType.STAFF_PASSWORD_RESET: _staff_password_reset_content,
    NotificationType.BOOKING_PAYMENT_CONFIRMED: _booking_payment_confirmed_content,
    NotificationType.NO_SHOW_NOTICE: _no_show_notice_content,
    NotificationType.REFUND_CONFIRMED: _refund_confirmed_content,
    NotificationType.RESCHEDULE_CONFIRMED: _reschedule_confirmed_content,
    NotificationType.GROUP_BOOKING_DECIDED: _group_booking_decided_content,
}


def build_content(*, notification_type, context):
    """Returns `{"subject": {"en": ..., "am": ...}, "body": {"en": ..., "am": ...}}`
    for a given `notification_type`/`context` pair (Sec 6.4). Falls back to
    a generic bilingual envelope for any not-yet-catalogued type instead of
    raising, so a caller from a future module is never hard-blocked."""
    builder = _CONTENT_BUILDERS.get(notification_type)
    if builder is None:
        return _fallback_content(notification_type, context)
    return builder(context)


def _bilingual_text(content_field):
    """Joins the English and Amharic copy for one channel message, per
    Sec 6.4's "Amharic and English content together on one document" rule
    applied to a single email/SMS body rather than a rendered document."""
    return f"{content_field['en']}\n\n{content_field['am']}"


# --------------------------------------------------------------------------
# Recording (Notification + NotificationDelivery rows)
# --------------------------------------------------------------------------


def record_notification(*, account, notification_type, context):
    """Creates the `Notification` event row and one `NotificationDelivery`
    row per channel (`queued`). Called once per logical notification --
    see the module docstring and `tasks.send_notification` for how a
    Celery retry avoids calling this a second time."""
    booking_id = context.get("booking_id") if context else None
    notification = Notification.objects.create(
        account=account,
        booking_id=booking_id,
        notification_type=notification_type,
    )
    NotificationDelivery.objects.bulk_create(
        [
            NotificationDelivery(notification=notification, channel=channel)
            for channel in _channels_for(notification_type)
        ]
    )
    return notification


# --------------------------------------------------------------------------
# Sending
# --------------------------------------------------------------------------


def _send_email(*, to_email, subject, body):
    if not to_email:
        raise _ChannelSendError("Account has no email address on file.")
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001 -- any backend failure is a delivery failure
        raise _ChannelSendError(f"Email send failed: {exc}") from exc


def _send_sms(*, to_phone, body):
    if not to_phone:
        raise _ChannelSendError("Account has no phone number on file.")

    if not settings.SMS_GATEWAY_URL:
        # No gateway configured (development/test, Document 08 Sec 8.2) --
        # mirrors EMAIL_BACKEND's console fallback: log instead of failing
        # the delivery, so local development and CI never need real
        # SMS credentials.
        logger.info("SMS (no gateway configured) to %s: %s", to_phone, body)
        return

    try:
        response = requests.post(
            settings.SMS_GATEWAY_URL,
            json={
                "sender_id": settings.SMS_GATEWAY_SENDER_ID,
                "to": to_phone,
                "message": body,
            },
            headers={"Authorization": f"Bearer {settings.SMS_GATEWAY_API_KEY}"},
            timeout=SMS_GATEWAY_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise _ChannelSendError(f"SMS send failed: {exc}") from exc


def _send_one(*, account, delivery, content):
    if delivery.channel == NotificationDelivery.Channel.EMAIL:
        _send_email(
            to_email=account.email,
            subject=content["subject"]["en"],
            body=_bilingual_text(content["body"]),
        )
    elif delivery.channel == NotificationDelivery.Channel.SMS:
        _send_sms(to_phone=account.phone, body=_bilingual_text(content["body"]))
    else:  # pragma: no cover -- guarded by the model's own choices constraint
        raise _ChannelSendError(f"Unknown channel: {delivery.channel}")


def send_pending_deliveries(*, notification, context):
    """Attempts every not-yet-`sent` delivery on `notification`. A
    delivery already `sent` (from an earlier attempt of a retried task) is
    left untouched -- this function never re-sends a channel that already
    succeeded. Raises `NotificationDeliveryError` if any channel failed on
    this attempt, listing every failure; the caller (`tasks.py`) decides
    whether to retry."""
    content = build_content(notification_type=notification.notification_type, context=context)
    account = notification.account

    errors = []
    for delivery in notification.deliveries.exclude(status=NotificationDelivery.Status.SENT):
        try:
            _send_one(account=account, delivery=delivery, content=content)
        except _ChannelSendError as exc:
            errors.append(f"{delivery.channel}: {exc}")
            continue
        delivery.status = NotificationDelivery.Status.SENT
        delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "sent_at"])

    if errors:
        raise NotificationDeliveryError("; ".join(errors))


def mark_stalled_deliveries_failed(*, notification, error_message):
    """Called on final job exhaustion (Design Spec Sec 6.1) -- every
    delivery still not `sent` is marked `failed` with `error_message`
    populated, per Document 05 Sec 3.9's "populated on final job
    exhaustion" note."""
    notification.deliveries.exclude(status=NotificationDelivery.Status.SENT).update(
        status=NotificationDelivery.Status.FAILED, error_message=error_message
    )
    logger.error(
        "notifications.send_notification exhausted retries: notification=%s type=%s: %s",
        notification.id,
        notification.notification_type,
        error_message,
    )
