"""
Mounted at /api/v1/bookings/ and /api/v1/ (config/urls.py). `/availability`
and `/availability/{date}` are top-level resources per Document 04 (no
`/bookings` path segment), matching how `apps.catalog.urls` mounts
`/categories` directly rather than under `/catalog`.
"""

from django.urls import path

from . import views

app_name = "bookings"

# Included at /api/v1/bookings/ (config/urls.py).
urlpatterns = [
    path("", views.BookingListCreateView.as_view(), name="booking-list"),
    path("<uuid:id>/", views.BookingDetailView.as_view(), name="booking-detail"),
    path(
        "<uuid:id>/receipt/download/",
        views.BookingReceiptDownloadView.as_view(),
        name="booking-receipt-download",
    ),
    path("<uuid:id>/cancel/", views.BookingCancelView.as_view(), name="booking-cancel"),
    path(
        "<uuid:id>/reschedule/",
        views.BookingRescheduleView.as_view(),
        name="booking-reschedule",
    ),
    path(
        "<uuid:id>/category-correction/",
        views.BookingCategoryCorrectionView.as_view(),
        name="booking-category-correction",
    ),
]

# Included at /api/v1/ directly (config/urls.py) -- top-level, like
# apps.catalog's /categories.
availability_urlpatterns = [
    path("availability/", views.AvailabilityListView.as_view(), name="availability-list"),
    path(
        "availability/<str:date>/",
        views.AvailabilityDetailView.as_view(),
        name="availability-detail",
    ),
]
