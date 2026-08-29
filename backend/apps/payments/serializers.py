"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.
"""

from rest_framework import serializers


class ChapaWebhookSerializer(serializers.Serializer):
    """`ChapaWebhookPayload` (Document 04). Only `tx_ref`/`status` are
    validated here -- Chapa's payload carries additional fields as needed
    (Document 04's `additionalProperties: true`), which `services.
    confirm_payment_from_webhook` stores as-is in `payment.webhook_payload`
    (`request.data`, not `validated_data`) rather than having every field
    modeled here."""

    tx_ref = serializers.CharField()
    status = serializers.CharField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    currency = serializers.CharField(required=False, allow_null=True, allow_blank=True)
