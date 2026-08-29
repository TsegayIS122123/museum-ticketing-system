"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

Per `contracts/openapi.yaml`: this module is cross-cutting infrastructure,
not a Visitor/Staff-facing API surface -- there is no
`GET/POST /notifications` endpoint in the contract, so there is nothing to
expose for *creating* a notification (that only ever happens via
`tasks.send_notification`, enqueued from another app's services.py).

`NotificationSerializer`/`NotificationDeliverySerializer` below are
read-only representations kept for `admin.py` and for any future
Staff-facing "delivery history" view (Document 05 Sec 3.9 already models
the data for one); nothing currently routes to them (see `urls.py`).
"""

from rest_framework import serializers

from .models import Notification, NotificationDelivery


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
