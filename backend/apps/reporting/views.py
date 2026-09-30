"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from datetime import date as _date

from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsMuseumManagerOrPlatformAdmin

from . import services
from .serializers import (
    AttendanceReportSerializer,
    BookingTimelineSerializer,
    CashierBalancesSerializer,
    CategoriesReportSerializer,
    DashboardSerializer,
    InstitutionDetailSerializer,
    InstitutionsReportSerializer,
    PeriodComparisonSerializer,
    ReportSummarySerializer,
    RevenueReportSerializer,
)


def _parse_optional_date(request, param):
    """Mirrors `apps.bookings.views._parse_required_date`, but for an
    optional query parameter: `from`/`to` on `GET /reports/summary` are
    an all-or-nothing pair (services.resolve_period_range enforces that),
    not individually required."""
    raw = request.query_params.get(param)
    if not raw:
        return None
    try:
        return _date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({param: "Must be an ISO-8601 date (YYYY-MM-DD)."})


class DashboardView(APIView):
    """GET /reports/dashboard -- Museum Manager/Platform Admin only
    (FR-REPORT-001)."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getDashboard", responses=DashboardSerializer)
    def get(self, request):
        dashboard = services.get_dashboard()
        return Response(DashboardSerializer(dashboard).data)


class ReportSummaryView(APIView):
    """GET /reports/summary -- Museum Manager/Platform Admin only
    (FR-REPORT-002)."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getReportSummary", responses=ReportSummarySerializer)
    def get(self, request):
        period = request.query_params.get("period")
        if not period:
            raise ValidationError({"period": "This query parameter is required."})

        date_from = _parse_optional_date(request, "from")
        date_to = _parse_optional_date(request, "to")

        summary = services.get_report_summary(
            period=period, date_from=date_from, date_to=date_to
        )
        return Response(ReportSummarySerializer(summary).data)


class CashierBalancesView(APIView):
    """GET /reports/cashier-balances -- Museum Manager/Platform Admin only
    (FR-REPORT-003). Every Cashier's current outstanding balance, so a
    Manager can check it against total revenue -- see
    `services.get_cashier_balances`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getCashierBalances", responses=CashierBalancesSerializer)
    def get(self, request):
        balances = services.get_cashier_balances()
        return Response(CashierBalancesSerializer(balances).data)


class BookingTimelineView(APIView):
    """GET /reports/booking-timeline -- Museum Manager/Platform Admin only.
    A day-by-day awaiting/pending/visited/cancelled/refunded breakdown a
    Manager can use to spot a crowded upcoming date and close it in
    Availability -- see `services.get_booking_timeline`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getBookingTimeline", responses=BookingTimelineSerializer)
    def get(self, request):
        date_from = _parse_optional_date(request, "from")
        date_to = _parse_optional_date(request, "to")

        timeline = services.get_booking_timeline(date_from=date_from, date_to=date_to)
        return Response(BookingTimelineSerializer(timeline).data)


# ============================================================================
# Phase 7b (UAT round 1)
# ============================================================================


def _resolve_range_from_request(request):
    """Shared `preset`/`from`/`to` query-param parsing for every Phase 7b
    view below -- `services.resolve_report_range` does the actual
    resolution (and enforces the both-or-neither/preset-required rules);
    this only reads the three raw query params off the request."""
    preset = request.query_params.get("preset")
    date_from = _parse_optional_date(request, "from")
    date_to = _parse_optional_date(request, "to")
    return services.resolve_report_range(preset=preset, date_from=date_from, date_to=date_to)


class InstitutionsReportView(APIView):
    """GET /reports/institutions -- Museum Manager/Platform Admin only
    (Phase 7b). Per-institution rollup over a `preset`- or `from`/`to`-
    resolved range -- see `services.get_institutions_report`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getInstitutionsReport", responses=InstitutionsReportSerializer)
    def get(self, request):
        date_from, date_to = _resolve_range_from_request(request)
        institution_id = request.query_params.get("institutionId") or None
        limit = int(request.query_params.get("limit", 25))
        offset = int(request.query_params.get("offset", 0))
        sort = request.query_params.get("sort", "-revenue_etb")

        report = services.get_institutions_report(
            date_from=date_from,
            date_to=date_to,
            institution_id=institution_id,
            limit=limit,
            offset=offset,
            sort=sort,
        )
        return Response(InstitutionsReportSerializer(report).data)


class InstitutionDetailView(APIView):
    """GET /reports/institutions/{id} -- Museum Manager/Platform Admin
    only (Phase 7b). One school's own visit history -- see
    `services.get_institution_detail`. `from`/`to` optional here (unlike
    every other Phase 7b report), both-or-neither."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getInstitutionDetail", responses=InstitutionDetailSerializer)
    def get(self, request, id):
        date_from = _parse_optional_date(request, "from")
        date_to = _parse_optional_date(request, "to")
        detail = services.get_institution_detail(
            institution_id=id, date_from=date_from, date_to=date_to
        )
        return Response(InstitutionDetailSerializer(detail).data)


class CategoriesReportView(APIView):
    """GET /reports/categories -- Museum Manager/Platform Admin only
    (Phase 7b). Headcount/revenue by category plus a time series -- see
    `services.get_categories_report`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getCategoriesReport", responses=CategoriesReportSerializer)
    def get(self, request):
        date_from, date_to = _resolve_range_from_request(request)
        report = services.get_categories_report(date_from=date_from, date_to=date_to)
        return Response(CategoriesReportSerializer(report).data)


class AttendanceReportView(APIView):
    """GET /reports/attendance -- Museum Manager/Platform Admin only
    (Phase 7b). Booked vs. attended vs. shortfall, plus the Manager's own
    correction workload -- see `services.get_attendance_report`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getAttendanceReport", responses=AttendanceReportSerializer)
    def get(self, request):
        date_from, date_to = _resolve_range_from_request(request)
        report = services.get_attendance_report(date_from=date_from, date_to=date_to)
        return Response(AttendanceReportSerializer(report).data)


class RevenueReportView(APIView):
    """GET /reports/revenue -- Museum Manager/Platform Admin only
    (Phase 7b). Gross/refunds/net by period and category, individual vs.
    institutional -- see `services.get_revenue_report`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getRevenueReport", responses=RevenueReportSerializer)
    def get(self, request):
        date_from, date_to = _resolve_range_from_request(request)
        report = services.get_revenue_report(date_from=date_from, date_to=date_to)
        return Response(RevenueReportSerializer(report).data)


class PeriodComparisonView(APIView):
    """GET /reports/comparison -- Museum Manager/Platform Admin only
    (Phase 7b). Current range vs. the immediately preceding one of the
    same length -- see `services.get_period_comparison`."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(operation_id="getPeriodComparison", responses=PeriodComparisonSerializer)
    def get(self, request):
        date_from, date_to = _resolve_range_from_request(request)
        comparison = services.get_period_comparison(date_from=date_from, date_to=date_to)
        return Response(PeriodComparisonSerializer(comparison).data)
