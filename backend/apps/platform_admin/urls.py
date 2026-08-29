"""
Mounted at /api/v1/admin/ (config/urls.py) -- FR-ACC-002, Platform Admin
only. Plain `path()` entries rather than a `DefaultRouter`, matching
`apps.catalog.urls`'s own List/Detail split: Document 04 exposes exactly
two staff-account routes, not a full CRUD resource (no single-account
retrieve, no dynamic nested actions).
"""

from django.urls import path

from . import views

app_name = "platform_admin"

urlpatterns = [
    path("staff/", views.StaffListCreateView.as_view(), name="staff-list"),
    path("staff/<uuid:id>/", views.StaffDetailView.as_view(), name="staff-detail"),
]
