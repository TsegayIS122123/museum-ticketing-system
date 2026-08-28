"""
Mounted at /api/v1/payments/ (config/urls.py).

Per Design Spec Sec 4.2: the Chapa webhook is the ONLY path that confirms
a booking payment -- the client-side redirect after checkout is never
trusted on its own (NFR-SEC-001). Verify the webhook signature before
touching any booking state.
"""

from rest_framework.routers import DefaultRouter

app_name = "payments"
router = DefaultRouter()
# router.register("example", views.ExampleViewSet, basename="example")

urlpatterns = [
    # path("chapa/webhook/", views.ChapaWebhookView.as_view()),  # AllowAny + signature check
]

urlpatterns += router.urls
