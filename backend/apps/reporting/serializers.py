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
    from_ = serializers.DateField(source="from")
    to = serializers.DateField()
    revenueByCategory = serializers.DictField(
        source="revenue_by_category",
        child=serializers.DecimalField(max_digits=12, decimal_places=2),
    )
    visitorCountsByGroup = serializers.DictField(
        source="visitor_counts_by_group", child=serializers.IntegerField()
    )

    def to_representation(self, instance):
        """`from` is a Python keyword, so it can't be a field name here --
        the field above is declared as `from_` with `source="from"` (to
        read the dict key) and renamed back to `from` on the way out, to
        match Document 04's `ReportSummaryResponse.from` exactly."""
        data = super().to_representation(instance)
        data["from"] = data.pop("from_")
        return data
