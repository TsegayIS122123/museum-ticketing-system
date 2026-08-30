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
]
