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


# ============================================================================
# Phase 7b (UAT round 1)
# ============================================================================


class InstitutionsReportRowSerializer(serializers.Serializer):
    institutionId = serializers.UUIDField(source="institution_id", allow_null=True)
    name = serializers.CharField()
    tin = serializers.CharField(allow_null=True)
    visitCount = serializers.IntegerField(source="visit_count")
    distinctVisitDates = serializers.IntegerField(source="distinct_visit_dates")
    bookedTotal = serializers.IntegerField(source="booked_total")
    attendedTotal = serializers.IntegerField(source="attended_total")
    revenueEtb = serializers.DecimalField(source="revenue_etb", max_digits=12, decimal_places=2)
    firstVisit = serializers.DateField(source="first_visit")
    lastVisit = serializers.DateField(source="last_visit")


class InstitutionsReportMetaSerializer(serializers.Serializer):
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()
    total = serializers.IntegerField()


class InstitutionsReportSerializer(serializers.Serializer):
    """`GET /reports/institutions` response shape (Phase 7b)."""

    from_ = serializers.DateField()
    to = serializers.DateField()
    data = InstitutionsReportRowSerializer(many=True)
    meta = InstitutionsReportMetaSerializer()

    def get_fields(self):
        # Same DRF/drf-spectacular renaming trick used elsewhere in this
        # codebase (see apps.reporting.serializers' own ReportSummary
        # `from`/`from_` precedent) -- `from` is a Python keyword, so the
        # field is declared as `from_` and renamed back to `from` here.
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class InstitutionBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    nameAm = serializers.CharField(source="name_am", allow_null=True)
    tin = serializers.CharField(allow_null=True)


class InstitutionVisitSerializer(serializers.Serializer):
    bookingId = serializers.UUIDField(source="booking_id")
    reference = serializers.CharField()
    visitDate = serializers.DateField(source="visit_date")
    checkedInAt = serializers.DateTimeField(source="checked_in_at", allow_null=True)
    headcountByCategory = serializers.DictField(
        source="headcount_by_category", child=serializers.IntegerField()
    )
    bookedQuantity = serializers.IntegerField(source="booked_quantity")
    attendedQuantity = serializers.IntegerField(source="attended_quantity", allow_null=True)
    amountEtb = serializers.DecimalField(source="amount_etb", max_digits=12, decimal_places=2)
    ifmisDocumentNo = serializers.CharField(source="ifmis_document_no", allow_null=True)
    ifmisVoucherReference = serializers.CharField(source="ifmis_voucher_reference", allow_null=True)


class InstitutionDetailSerializer(serializers.Serializer):
    """`GET /reports/institutions/{id}` response shape (Phase 7b)."""

    institution = InstitutionBriefSerializer()
    from_ = serializers.DateField(allow_null=True)
    to = serializers.DateField(allow_null=True)
    visits = InstitutionVisitSerializer(many=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class CategoryReportRowSerializer(serializers.Serializer):
    category = serializers.CharField()
    bookedTotal = serializers.IntegerField(source="booked_total")
    attendedTotal = serializers.IntegerField(source="attended_total")
    revenueEtb = serializers.DecimalField(source="revenue_etb", max_digits=12, decimal_places=2)
    revenueSharePct = serializers.FloatField(source="revenue_share_pct", allow_null=True)


class CategoryPeriodBucketSerializer(serializers.Serializer):
    bucketStart = serializers.DateField(source="bucket_start")
    countsByCategory = serializers.DictField(
        source="counts_by_category", child=serializers.IntegerField()
    )


class CategoriesReportSerializer(serializers.Serializer):
    """`GET /reports/categories` response shape (Phase 7b)."""

    from_ = serializers.DateField()
    to = serializers.DateField()
    granularity = serializers.ChoiceField(choices=["daily", "weekly", "monthly"])
    categories = CategoryReportRowSerializer(many=True)
    periodBuckets = CategoryPeriodBucketSerializer(source="period_buckets", many=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class AttendanceByCategorySerializer(serializers.Serializer):
    category = serializers.CharField()
    bookedTotal = serializers.IntegerField(source="booked_total")
    attendedTotal = serializers.IntegerField(source="attended_total")
    shortfallTotal = serializers.IntegerField(source="shortfall_total")
    shortfallRatePct = serializers.FloatField(source="shortfall_rate_pct", allow_null=True)


class AttendanceReportSerializer(serializers.Serializer):
    """`GET /reports/attendance` response shape (Phase 7b)."""

    from_ = serializers.DateField()
    to = serializers.DateField()
    bookedTotal = serializers.IntegerField(source="booked_total")
    attendedTotal = serializers.IntegerField(source="attended_total")
    shortfallTotal = serializers.IntegerField(source="shortfall_total")
    shortfallRatePct = serializers.FloatField(source="shortfall_rate_pct", allow_null=True)
    byCategory = AttendanceByCategorySerializer(source="by_category", many=True)
    noShowBookingCount = serializers.IntegerField(source="no_show_booking_count")
    noShowHeadcount = serializers.IntegerField(source="no_show_headcount")
    noShowRatePct = serializers.FloatField(source="no_show_rate_pct", allow_null=True)
    correctedBookingCount = serializers.IntegerField(source="corrected_booking_count")
    currentlyFlaggedCount = serializers.IntegerField(source="currently_flagged_count")

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class RevenuePeriodBucketSerializer(serializers.Serializer):
    bucketStart = serializers.DateField(source="bucket_start")
    grossEtb = serializers.DecimalField(source="gross_etb", max_digits=12, decimal_places=2)
    refundsEtb = serializers.DecimalField(source="refunds_etb", max_digits=12, decimal_places=2)
    netEtb = serializers.DecimalField(source="net_etb", max_digits=12, decimal_places=2)


class RevenueReportSerializer(serializers.Serializer):
    """`GET /reports/revenue` response shape (Phase 7b)."""

    from_ = serializers.DateField()
    to = serializers.DateField()
    granularity = serializers.ChoiceField(choices=["daily", "weekly", "monthly"])
    grossEtb = serializers.DecimalField(source="gross_etb", max_digits=12, decimal_places=2)
    refundsEtb = serializers.DecimalField(source="refunds_etb", max_digits=12, decimal_places=2)
    netEtb = serializers.DecimalField(source="net_etb", max_digits=12, decimal_places=2)
    revenueByCategory = serializers.DictField(
        source="revenue_by_category", child=serializers.DecimalField(max_digits=12, decimal_places=2)
    )
    individualEtb = serializers.DecimalField(source="individual_etb", max_digits=12, decimal_places=2)
    institutionalEtb = serializers.DecimalField(
        source="institutional_etb", max_digits=12, decimal_places=2
    )
    periodBuckets = RevenuePeriodBucketSerializer(source="period_buckets", many=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class ComparisonFigureSerializer(serializers.Serializer):
    from_ = serializers.DateField()
    to = serializers.DateField()
    revenueEtb = serializers.DecimalField(source="revenue_etb", max_digits=12, decimal_places=2)
    bookingCount = serializers.IntegerField(source="booking_count")
    attendedTotal = serializers.IntegerField(source="attended_total")
    shortfallRatePct = serializers.FloatField(source="shortfall_rate_pct", allow_null=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("from_")
        return fields


class ComparisonDeltasSerializer(serializers.Serializer):
    revenueEtbPct = serializers.FloatField(source="revenue_etb_pct", allow_null=True)
    bookingCountPct = serializers.FloatField(source="booking_count_pct", allow_null=True)
    attendedTotalPct = serializers.FloatField(source="attended_total_pct", allow_null=True)


class PeriodComparisonSerializer(serializers.Serializer):
    """`GET /reports/comparison` response shape (Phase 7b) -- powers the
    Overview tab's "+12% vs previous period" KPI deltas. See
    `services.get_period_comparison`'s own docstring for why this is
    separate from `DashboardSerializer` above."""

    current = ComparisonFigureSerializer()
    previous = ComparisonFigureSerializer()
    deltas = ComparisonDeltasSerializer()
