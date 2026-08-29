"""
Mounted at /api/v1/payments/ (config/urls.py).

Per Design Spec Sec 4.2: the Chapa webhook is the ONLY path that confirms
a booking payment -- the client-side redirect after checkout is never
trusted on its own (NFR-SEC-001). Verify the webhook signature before
touching any booking state.
"""

from django.urls import path

from . import views

app_name = "payments"

urlpatterns = [
    path("webhooks/chapa/", views.ChapaWebhookView.as_view(), name="chapa-webhook"),
]
