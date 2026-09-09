"""
Request/response shape and field-level validation only (Design Spec Sec
3.1). Delegates to services.py for anything stateful.

Every serializer here is read-only over a plain dict returned by
services.py (Document 04's `DashboardResponse`/`ReportSummaryResponse`) --
there is no model behind either endpoint (see models.py), so a plain
`Serializer`, not a `ModelSerializer`, is used throughout, mirroring
`apps.settlement.serializers.OutstandingBalanceSerializer`'s own choice
for a computed, non-model figure.
"""

from rest_framework import serializers


class GroupVsIndividualSplitSerializer(serializers.Serializer):
    group = serializers.IntegerField()
    individual = serializers.IntegerField()


class StatusMixSerializer(serializers.Serializer):
    pending = serializers.IntegerField()
    visited = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    refunded = serializers.IntegerField()


class DashboardSerializer(serializers.Serializer):
    """`GET /reports/dashboard` response shape (FR-REPORT-001)."""

    revenueTotalEtb = serializers.DecimalField(
        source="revenue_total_etb", max_digits=12, decimal_places=2
    )
    visitorCountsByCategory = serializers.DictField(
        source="visitor_counts_by_category", child=serializers.IntegerField()
    )
    groupVsIndividualSplit = GroupVsIndividualSplitSerializer(
        source="group_vs_individual_split"
    )
    statusMix = StatusMixSerializer(source="status_mix")


class ReportSummarySerializer(serializers.Serializer):
    """`GET /reports/summary` response shape (FR-REPORT-002). "Yearly"
    follows the organization's fiscal calendar, not Jan-Dec -- see
    `services.resolve_period_range`."""

    period = serializers.ChoiceField(
        choices=["daily", "weekly", "monthly", "yearly"]
    )
    # No explicit `source=` here: after `get_fields()` below renames this
    # field's key to "from", DRF's default (source == field_name) already
    # resolves to "from", and DRF asserts against a *redundant* explicit
    # `source` that matches the bound field name.
    from_ = serializers.DateField()
    to = serializers.DateField()
    bookingCount = serializers.IntegerField(source="booking_count")
    revenueByCategory = serializers.DictField(
        source="revenue_by_category",
        child=serializers.DecimalField(max_digits=12, decimal_places=2),
    )
    visitorCountsByGroup = serializers.DictField(
        source="visitor_counts_by_group", child=serializers.IntegerField()
    )

    def get_fields(self):
        """`from` is a Python keyword, so it can't be a field's attribute
        name in the class body above -- the field is declared as `from_`
        with `source="from"` (so it still reads the right dict key from
        the instance). But a field's *output* key comes from its dict key
        in `get_fields()`'s return value (DRF's `Field.bind()` sets
        `field_name` from that key when the serializer's `fields`
        BindingDict is built), not from the Python attribute name it was
        assigned to -- so renaming `from_` -> `from` here, rather than
        post-processing the dict in `to_representation`, makes the field
        genuinely named `from` end-to-end. drf-spectacular's schema
        introspection reads this same bound `fields` dict, so this also
        fixes the previously-wrong `from_` property name in the generated
        contract (confirmed via `manage.py spectacular`) -- no frontend
        override needed for this field anymore."""
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class CashierBalanceSerializer(serializers.Serializer):
    """One row of `GET /reports/cashier-balances`'s `cashiers` list --
    see `services.get_cashier_balances`."""

    cashierId = serializers.UUIDField(source="cashier_id")
    cashierName = serializers.CharField(source="cashier_name")
    outstandingBalanceEtb = serializers.DecimalField(
        source="outstanding_balance_etb", max_digits=12, decimal_places=2
    )
    unreconciledBookingCount = serializers.IntegerField(
        source="unreconciled_booking_count"
    )


class CashierBalancesSerializer(serializers.Serializer):
    """`GET /reports/cashier-balances` response shape (FR-REPORT-003).
    `totalOutstandingEtb + totalReconciledEtb` is meant to be checked
    against `totalRevenueEtb` -- see `services.get_cashier_balances`'s
    docstring for what a mismatch would mean."""

    cashiers = CashierBalanceSerializer(many=True)
    totalOutstandingEtb = serializers.DecimalField(
        source="total_outstanding_etb", max_digits=12, decimal_places=2
    )
    totalReconciledEtb = serializers.DecimalField(
        source="total_reconciled_etb", max_digits=12, decimal_places=2
    )
    totalRevenueEtb = serializers.DecimalField(
        source="total_revenue_etb", max_digits=12, decimal_places=2
    )


class BookingTimelineDaySerializer(serializers.Serializer):
    """One day of `GET /reports/booking-timeline`'s `days` list -- see
    `services.get_booking_timeline`."""

    date = serializers.DateField(source="visit_date")
    isOpenForBooking = serializers.BooleanField(source="is_open_for_booking")
    awaitingPaymentCount = serializers.IntegerField(source="awaiting_payment_count")
    pendingCount = serializers.IntegerField(source="pending_count")
    visitedCount = serializers.IntegerField(source="visited_count")
    cancelledCount = serializers.IntegerField(source="cancelled_count")
    refundedCount = serializers.IntegerField(source="refunded_count")
    awaitingPaymentHeadcount = serializers.IntegerField(
        source="awaiting_payment_headcount"
    )
    pendingHeadcount = serializers.IntegerField(source="pending_headcount")
    visitedHeadcount = serializers.IntegerField(source="visited_headcount")
    expectedHeadcount = serializers.IntegerField(source="expected_headcount")


class BookingTimelineSerializer(serializers.Serializer):
    """`GET /reports/booking-timeline` response shape. Mirrors
    `ReportSummarySerializer`'s `from`/`get_fields` trick above -- same
    Python-keyword problem, same fix."""

    from_ = serializers.DateField()
    to = serializers.DateField()
    days = BookingTimelineDaySerializer(many=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields
