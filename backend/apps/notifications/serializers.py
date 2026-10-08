"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

Per `contracts/openapi.yaml`: the only notification endpoints are the
caller-scoped push-device registry and notification preferences
(FR-NOTIFY-PUSH-001/FR-NOTIFY-PREF-001) -- there is no
`GET/POST /notifications` endpoint, so nothing exposes *creating* a
notification (that only ever happens via `tasks.send_notification`,
enqueued from another app's services.py).

`NotificationSerializer`/`NotificationDeliverySerializer` below are
read-only representations kept for `admin.py` and for any future
Staff-facing "delivery history" view (Document 05 Sec 3.9 already models
the data for one); nothing currently routes to them.
"""

from rest_framework import serializers

from .models import (
    DeviceToken,
    Notification,
    NotificationDelivery,
    NotificationPreference,
)


class NotificationDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationDelivery
        fields = ["id", "channel", "status", "sent_at", "error_message", "created_at"]
        read_only_fields = fields


class NotificationSerializer(serializers.ModelSerializer):
    deliveries = NotificationDeliverySerializer(many=True, read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "account",
            "booking",
            "notification_type",
            "created_at",
            "deliveries",
        ]
        read_only_fields = fields


class DeviceTokenSerializer(serializers.ModelSerializer):
    """`DeviceToken` (Document 04) -- FR-NOTIFY-PUSH-001. `active` and
    `lastSeenAt` are server-managed (see
    `services.register_device`/`unregister_device`); a client only ever
    supplies `token` and `platform`."""

    lastSeenAt = serializers.DateTimeField(source="last_seen_at", read_only=True, allow_null=True)

    class Meta:
        model = DeviceToken
        fields = ["token", "platform", "active", "lastSeenAt"]
        read_only_fields = ["active", "lastSeenAt"]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """`NotificationPreference` (Document 04) -- FR-NOTIFY-PREF-001. All
    four fields are always present in a response and all four are required
    on the replacing `PUT` (a full replace, not a partial update)."""

    emailEnabled = serializers.BooleanField(source="email_enabled")
    smsEnabled = serializers.BooleanField(source="sms_enabled")
    pushEnabled = serializers.BooleanField(source="push_enabled")

    class Meta:
        model = NotificationPreference
        fields = ["emailEnabled", "smsEnabled", "pushEnabled", "language"]
