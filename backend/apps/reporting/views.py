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
from .serializers import DashboardSerializer, ReportSummarySerializer


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
