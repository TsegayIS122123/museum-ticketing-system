"""
Per Document 04, these two routes live at `/bookings/lookup` and
`/bookings/{id}/check-in` -- no `/entrance` path segment -- even though
`entrance` owns the business logic behind them (Design Spec Sec 3.2:
`entrance` implements FR-TICKET). This mirrors how `apps.bookings.urls`
exports `availability_urlpatterns` for mounting at the URLconf root
instead of under its own `/bookings/` prefix: module ownership of logic
and placement in the URL namespace are independent decisions here.

`entrance_urlpatterns` is included directly at `/api/v1/` in
config/urls.py, not at `/api/v1/entrance/` -- there is deliberately no
bare `/api/v1/entrance/` prefix in the live API surface.

Per ADR-007: lookup accepts EITHER a typed reference code or a
keyboard-wedge QR scan through the same text input field -- no camera
scanning, no new hardware requirement (Doc 03 Sec 5.1).
"""

from django.urls import path

from . import views

app_name = "entrance"

entrance_urlpatterns = [
    path("bookings/lookup/", views.CheckInLookupView.as_view(), name="lookup"),  # IsCashier
    path(
        "bookings/<uuid:id>/check-in/",
        views.CheckInView.as_view(),
        name="check-in",
    ),  # IsCashier
]

# Kept empty deliberately: there is no `/api/v1/entrance/` prefix in the
# live API (see module docstring) -- config/urls.py includes
# `entrance_urlpatterns` at the root instead of this module's default
# `urlpatterns`.
urlpatterns = []
