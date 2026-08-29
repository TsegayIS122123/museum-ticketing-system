"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.
"""

from rest_framework import serializers

from .models import Refund


class RefundSerializer(serializers.ModelSerializer):
    """`Refund` (Document 04). Read-only -- every mutation goes through
    `RefundRequestCreateSerializer` and services.py, never through this
    serializer directly."""

    bookingId = serializers.UUIDField(source="booking_id", read_only=True)
    amountEtb = serializers.DecimalField(
        source="amount_etb", read_only=True, max_digits=12, decimal_places=2
    )
    chapaRefundReference = serializers.CharField(
        source="chapa_refund_reference", read_only=True, allow_null=True
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Refund
        fields = [
            "id",
            "bookingId",
            "amountEtb",
            "reason",
            "status",
            "chapaRefundReference",
            "createdAt",
        ]
        read_only_fields = fields


class RefundRequestCreateSerializer(serializers.Serializer):
    """`RefundRequestCreate` (Document 04) -- FR-TICKET-002/FR-REFUND-001b.
    `note` is free-text context supplied with a shortfall request
    (Document 05 Sec 3.5's `refund.note` column)."""

    note = serializers.CharField(required=False, allow_null=True, allow_blank=True)
