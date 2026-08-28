"""
Mounted at /api/v1/ directly (config/urls.py) -- Document 04's
`/categories` and `/categories/{id}` are top-level resources with no
`/catalog` path segment, unlike accounts' `/auth`-prefixed endpoints.
"""

from django.urls import path

from . import views

app_name = "catalog"

urlpatterns = [
    path("categories/", views.CategoryListCreateView.as_view(), name="category-list"),
    path("categories/<uuid:id>/", views.CategoryDetailView.as_view(), name="category-detail"),
]
