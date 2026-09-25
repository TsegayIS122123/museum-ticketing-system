"""
Mounted at /api/v1/ directly (config/urls.py) -- `/institutions` is a
top-level resource, same reasoning as `apps.catalog.urls`'s own
`/categories`.
"""

from django.urls import path

from . import views

app_name = "institutions"

urlpatterns = [
    path("institutions/", views.InstitutionLookupView.as_view(), name="lookup"),
]
