"""
Mounted at /api/v1/entrance/ (config/urls.py).

Per ADR-007: lookup accepts EITHER a typed reference code or a
keyboard-wedge QR scan through the same text input field -- no camera
scanning, no new hardware requirement (Doc 03 Sec 5.1).
"""

from rest_framework.routers import DefaultRouter

app_name = "entrance"
router = DefaultRouter()
# router.register("example", views.ExampleViewSet, basename="example")

urlpatterns = [
    # path("lookup/", views.CheckInLookupView.as_view()),           # IsStaff (Cashier)
    # path("check-in/", views.ConfirmHeadcountView.as_view()),      # IsStaff (Cashier)
]

urlpatterns += router.urls
