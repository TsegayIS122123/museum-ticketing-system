"""
Mounted at /api/v1/reports/ (config/urls.py) -- not /api/v1/reporting/,
per Document 04's actual paths (`/reports/dashboard`, `/reports/summary`).
Neither endpoint is a DRF router-managed resource (no CRUD, no
model-backed viewset -- see models.py/views.py), so this is a plain
`path()` list rather than a `DefaultRouter`, mirroring
`apps.settlement.urls`'s own choice for the same reason.
"""

from django.urls import path

from . import views

app_name = "reporting"

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("summary/", views.ReportSummaryView.as_view(), name="summary"),
    path(
        "cashier-balances/",
        views.CashierBalancesView.as_view(),
        name="cashier-balances",
    ),
    path(
        "booking-timeline/",
        views.BookingTimelineView.as_view(),
        name="booking-timeline",
    ),
    # Phase 7b (UAT round 1)
    path(
        "institutions/",
        views.InstitutionsReportView.as_view(),
        name="institutions-report",
    ),
    path(
        "institutions/<uuid:id>/",
        views.InstitutionDetailView.as_view(),
        name="institution-detail",
    ),
    path(
        "categories/",
        views.CategoriesReportView.as_view(),
        name="categories-report",
    ),
    path(
        "attendance/",
        views.AttendanceReportView.as_view(),
        name="attendance-report",
    ),
    path(
        "revenue/",
        views.RevenueReportView.as_view(),
        name="revenue-report",
    ),
    path(
        "comparison/",
        views.PeriodComparisonView.as_view(),
        name="comparison",
    ),
]
