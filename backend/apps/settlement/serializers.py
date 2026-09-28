"""
settlement -- serializers

Request/response shape and field-level validation only (Design Spec Sec
3.1). Delegates to services.py for anything stateful.

Field naming mirrors `apps.refunds.serializers.RefundSerializer`: model
snake_case mapped to API camelCase via `source=`, read-only end to end --
every mutation goes through services.py, never through these serializers
directly.
"""

from rest_framework import serializers

from .models import CashierReconciliation


class OutstandingBalanceSerializer(serializers.Serializer):
    """`GET /settlement/my-balance/` response shape. Wraps a plain
    Decimal (the return value of `services.get_outstanding_balance`) --
    there is no model behind this endpoint, it's a computed figure, so a
    plain `Serializer` over a `{"balance_etb": ...}` dict is used rather
    than a `ModelSerializer`.

    `pendingVoucherCount` (Phase 6, UAT round 1) -- how many of her own
    outstanding bookings don't yet have both IFMIS identifiers recorded
    (`services.count_pending_vouchers`), so nothing is silently left
    pending at end of shift. Zero is the expected, common case."""

    balanceEtb = serializers.DecimalField(
        source="balance_etb", max_digits=12, decimal_places=2, read_only=True
    )
    pendingVoucherCount = serializers.IntegerField(
        source="pending_voucher_count", read_only=True
    )


class CashierReconciliationSerializer(serializers.ModelSerializer):
    """`CashierReconciliation` (per-cashier settlement transfer). Read-only
    -- every mutation goes through `services.initiate_reconciliation` /
    `confirm_reconciliation_success` / `confirm_reconciliation_failure`,
    never through this serializer directly."""

    cashierId = serializers.UUIDField(source="cashier_id", read_only=True)
    amountEtb = serializers.DecimalField(
        source="amount_etb", read_only=True, max_digits=12, decimal_places=2
    )
    chapaTransferReference = serializers.CharField(
        source="chapa_transfer_reference", read_only=True, allow_null=True
    )
    initiatedAt = serializers.DateTimeField(
        source="initiated_at", read_only=True, allow_null=True
    )
    completedAt = serializers.DateTimeField(
        source="completed_at", read_only=True, allow_null=True
    )
    # Populated once `tasks.render_and_store_transfer_receipt` finishes --
    # null until then, and null forever on a FAILED reconciliation (mirrors
    # `chapaTransferReference`/`completedAt`'s own COMPLETED-only shape).
    # The document the Cashier takes to Finance alongside her IFMIS
    # vouchers.
    transferReceiptUrl = serializers.CharField(
        source="transfer_receipt_url", read_only=True, allow_null=True
    )
    failureReason = serializers.CharField(
        source="failure_reason", read_only=True, allow_null=True
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = CashierReconciliation
        fields = [
            "id",
            "cashierId",
            "amountEtb",
            "chapaTransferReference",
            "status",
            "initiatedAt",
            "completedAt",
            "transferReceiptUrl",
            "failureReason",
            "createdAt",
        ]
        read_only_fields = fields


class ChapaTransferWebhookSerializer(serializers.Serializer):
    """Chapa's Transfer (Payout) webhook payload
    (https://developer.chapa.co/integrations/webhooks -- `"type":
    "Payout"` events, e.g. `event: "payout.success"`). Only `reference`/
    `status` are validated here -- mirrors
    `apps.payments.serializers.ChapaWebhookSerializer`'s own choice to
    model just the two fields the service layer actually branches on and
    pass the rest of the payload through as-is. `reference` is the value
    *we* supplied when calling the Transfer API
    (`services.call_chapa_transfer_api` sends `str(reconciliation.id)`),
    which Chapa echoes back unchanged -- that's what
    `services.handle_chapa_transfer_webhook` looks the row up by, not
    `chapa_reference` (Chapa's own internal id for the transfer, stored
    for reference but never used as a lookup key)."""

    event = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    reference = serializers.CharField()
    status = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    chapa_reference = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    currency = serializers.CharField(required=False, allow_null=True, allow_blank=True)
