"""
`/refunds` is mounted at `/api/v1/refunds/` (config/urls.py) via
`urlpatterns` below.

`/bookings/{id}/refund-requests` is instead a top-level resource (no
`/refunds` path segment) per Document 04 -- `refund_request_urlpatterns`
is exported here for config/urls.py to include directly at `/api/v1/`,
mirroring how `apps.bookings.urls` exports `availability_urlpatterns` and
`apps.entrance.urls` exports `entrance_urlpatterns` for the same reason:
module ownership of logic and placement in the URL namespace are
independent decisions in this codebase.
"""

from django.urls import path

from . import views

app_name = "refunds"

# Included at /api/v1/refunds/ (config/urls.py).
urlpatterns = [
    path("", views.RefundListView.as_view(), name="refund-list"),
]

# Included at /api/v1/ directly (config/urls.py) -- top-level, like
# apps.bookings' /availability and apps.entrance's /bookings/lookup.
refund_request_urlpatterns = [
    path(
        "bookings/<uuid:id>/refund-requests/",
        views.RefundRequestView.as_view(),
        name="refund-request",
    ),
]
