"""
Unit tests against notifications/services.py and notifications/tasks.py
directly (Design Spec Sec 3.1), per the coverage target in NFR-MAINT-001.
Prefer these over HTTP-level tests for business-rule coverage -- there is
no HTTP surface here anyway (see views.py's docstring).

Every test mocks `services._send_email`/`services._send_sms` -- the two
functions that actually talk to an email backend / SMS gateway -- rather
than the network, mirroring how `apps.payments`' tests mock
`_initialize_chapa_checkout` instead of `requests`.
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import Account
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.notifications import services
from apps.notifications.models import Notification, NotificationDelivery
from apps.notifications.tasks import send_notification

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)


def _make_account(email="visitor@example.com", phone="+251911000000"):
    return Account.objects.create_user(
        email=email, phone=phone, full_name="Hana Bekele", role=Account.Role.VISITOR
    )


def _make_booking(*, visitor):
    category = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=Decimal("100.00")
    )
    return Booking.objects.create(
        visitor=visitor,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=1,
        total_amount_etb=category.price_etb,
        status=Booking.Status.PENDING,
    )


# --------------------------------------------------------------------------
# build_content (FR-LOC-001/002, Sec 6.4)
# --------------------------------------------------------------------------


def test_build_content_visitor_otp_includes_code_and_expiry_in_both_languages():
    content = services.build_content(
        notification_type=Notification.NotificationType.VISITOR_OTP,
        context={"otp_code": "482913", "expires_in_seconds": 600},
    )

    assert "482913" in content["body"]["en"]
    assert "482913" in content["body"]["am"]
    assert content["subject"]["en"]
    assert content["subject"]["am"]


def test_build_content_unknown_type_falls_back_to_generic_bilingual_envelope():
    content = services.build_content(notification_type="some_future_type", context={"x": 1})

    assert "some_future_type" in content["body"]["en"]
    assert content["body"]["am"]


# --------------------------------------------------------------------------
# record_notification
# --------------------------------------------------------------------------


def test_record_notification_creates_one_delivery_per_channel():
    account = _make_account()

    notification = services.record_notification(
        account=account,
        notification_type=Notification.NotificationType.VISITOR_OTP,
        context={"otp_code": "111111", "expires_in_seconds": 600},
    )

    assert notification.account_id == account.id
    assert notification.booking_id is None
    deliveries = list(notification.deliveries.all())
    assert len(deliveries) == 1
    assert deliveries[0].channel == NotificationDelivery.Channel.SMS
    assert deliveries[0].status == NotificationDelivery.Status.QUEUED


def test_record_notification_links_a_booking_id_from_context():
    account = _make_account()
    booking = _make_booking(visitor=account)

    notification = services.record_notification(
        account=account,
        notification_type=Notification.NotificationType.BOOKING_PAYMENT_CONFIRMED,
        context={"booking_id": str(booking.id), "reference": booking.reference},
    )

    assert str(notification.booking_id) == str(booking.id)


def test_record_notification_fans_out_to_both_channels_for_no_show_notice():
    account = _make_account()

    notification = services.record_notification(
        account=account,
        notification_type=Notification.NotificationType.NO_SHOW_NOTICE,
        context={"booking_id": None, "reference": "ABCD1234", "visit_date": "2026-09-01"},
    )

    channels = {d.channel for d in notification.deliveries.all()}
    assert channels == {NotificationDelivery.Channel.EMAIL, NotificationDelivery.Channel.SMS}
    assert notification.booking_id is None


# --------------------------------------------------------------------------
# send_pending_deliveries
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.services._send_sms")
def test_send_pending_deliveries_marks_delivery_sent_on_success(mock_send_sms):
    account = _make_account()
    context = {"otp_code": "222222", "expires_in_seconds": 600}
    notification = services.record_notification(
        account=account, notification_type=Notification.NotificationType.VISITOR_OTP, context=context
    )

    services.send_pending_deliveries(notification=notification, context=context)

    delivery = notification.deliveries.get()
    assert delivery.status == NotificationDelivery.Status.SENT
    assert delivery.sent_at is not None
    mock_send_sms.assert_called_once()


@mock.patch("apps.notifications.services._send_sms", side_effect=services._ChannelSendError("boom"))
def test_send_pending_deliveries_raises_and_leaves_delivery_queued_on_failure(mock_send_sms):
    account = _make_account()
    context = {"otp_code": "333333", "expires_in_seconds": 600}
    notification = services.record_notification(
        account=account, notification_type=Notification.NotificationType.VISITOR_OTP, context=context
    )

    with pytest.raises(services.NotificationDeliveryError):
        services.send_pending_deliveries(notification=notification, context=context)

    delivery = notification.deliveries.get()
    assert delivery.status == NotificationDelivery.Status.QUEUED
    assert delivery.error_message is None


@mock.patch("apps.notifications.services._send_sms")
@mock.patch("apps.notifications.services._send_email")
def test_send_pending_deliveries_skips_channels_already_sent(mock_send_email, mock_send_sms):
    account = _make_account()
    context = {"booking_id": None, "reference": "ABCD1234", "visit_date": "2026-09-01"}
    notification = services.record_notification(
        account=account, notification_type=Notification.NotificationType.NO_SHOW_NOTICE, context=context
    )
    sms_delivery = notification.deliveries.get(channel=NotificationDelivery.Channel.SMS)
    sms_delivery.status = NotificationDelivery.Status.SENT
    sms_delivery.save(update_fields=["status"])

    services.send_pending_deliveries(notification=notification, context=context)

    mock_send_sms.assert_not_called()
    mock_send_email.assert_called_once()


# --------------------------------------------------------------------------
# mark_stalled_deliveries_failed
# --------------------------------------------------------------------------


def test_mark_stalled_deliveries_failed_only_touches_non_sent_deliveries():
    account = _make_account()
    context = {"booking_id": None, "reference": "ABCD1234", "visit_date": "2026-09-01"}
    notification = services.record_notification(
        account=account, notification_type=Notification.NotificationType.NO_SHOW_NOTICE, context=context
    )
    sent = notification.deliveries.get(channel=NotificationDelivery.Channel.EMAIL)
    sent.status = NotificationDelivery.Status.SENT
    sent.save(update_fields=["status"])

    services.mark_stalled_deliveries_failed(notification=notification, error_message="gateway down")

    sent.refresh_from_db()
    stalled = notification.deliveries.get(channel=NotificationDelivery.Channel.SMS)
    assert sent.status == NotificationDelivery.Status.SENT
    assert sent.error_message is None
    assert stalled.status == NotificationDelivery.Status.FAILED
    assert stalled.error_message == "gateway down"


# --------------------------------------------------------------------------
# send_notification task (retry / idempotency)
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.services._send_sms")
def test_send_notification_task_creates_notification_and_sends_on_first_attempt(mock_send_sms):
    account = _make_account()

    result = send_notification.run(
        account_id=str(account.id),
        notification_type=Notification.NotificationType.VISITOR_OTP,
        context={"otp_code": "444444", "expires_in_seconds": 600},
    )

    notification = Notification.objects.get(id=result)
    assert notification.deliveries.get().status == NotificationDelivery.Status.SENT
    mock_send_sms.assert_called_once()


def test_send_notification_task_is_a_noop_for_a_missing_account():
    result = send_notification.run(
        account_id="00000000-0000-0000-0000-000000000000",
        notification_type=Notification.NotificationType.VISITOR_OTP,
        context={"otp_code": "555555", "expires_in_seconds": 600},
    )

    assert result is None
    assert Notification.objects.count() == 0


@mock.patch(
    "apps.notifications.services._send_sms",
    side_effect=services._ChannelSendError("gateway timeout"),
)
def test_send_notification_task_retries_without_creating_a_duplicate_notification(mock_send_sms):
    account = _make_account()

    with mock.patch.object(send_notification, "retry", side_effect=Exception("retried")):
        with pytest.raises(Exception, match="retried"):
            send_notification.run(
                account_id=str(account.id),
                notification_type=Notification.NotificationType.VISITOR_OTP,
                context={"otp_code": "666666", "expires_in_seconds": 600},
            )

    # Exactly one Notification row was created despite the failed attempt --
    # a subsequent Celery-issued retry passes `notification_id` back in
    # (see tasks.py) instead of calling record_notification again.
    assert Notification.objects.count() == 1
    delivery = NotificationDelivery.objects.get()
    assert delivery.status == NotificationDelivery.Status.QUEUED


@mock.patch(
    "apps.notifications.services._send_sms",
    side_effect=services._ChannelSendError("gateway down"),
)
def test_send_notification_task_marks_deliveries_failed_on_final_exhaustion(mock_send_sms):
    account = _make_account()
    notification = services.record_notification(
        account=account,
        notification_type=Notification.NotificationType.VISITOR_OTP,
        context={"otp_code": "777777", "expires_in_seconds": 600},
    )

    # Simulate the task being invoked on its last allowed attempt: Celery's
    # own `self.retry()` raises `MaxRetriesExceededError` once `max_retries`
    # attempts have already happened.
    with mock.patch.object(
        send_notification, "retry", side_effect=send_notification.MaxRetriesExceededError()
    ):
        result = send_notification.run(
            account_id=str(account.id),
            notification_type=Notification.NotificationType.VISITOR_OTP,
            context={"otp_code": "777777", "expires_in_seconds": 600},
            notification_id=str(notification.id),
        )

    assert result is None
    delivery = notification.deliveries.get()
    assert delivery.status == NotificationDelivery.Status.FAILED
    assert delivery.error_message
    # No second Notification row was created for the retried attempt.
    assert Notification.objects.count() == 1
