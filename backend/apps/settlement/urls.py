"""
Mounted at /api/v1/settlement/ (config/urls.py) -- unlike `apps.entrance`/
`apps.refunds`, none of this app's endpoints need to live at a top-level
path outside their own prefix, so there is no exported
`*_urlpatterns` list here for config/urls.py to include separately.
"""

from django.urls import path

from . import views

app_name = "settlement"

urlpatterns = [
    path("my-balance/", views.MyBalanceView.as_view(), name="my-balance"),
    path("reconcile/", views.ReconcileView.as_view(), name="reconcile"),
    path(
        "reconciliations/",
        views.ReconciliationListView.as_view(),
        name="reconciliation-list",
    ),
    path(
        "webhook/chapa-transfer/",
        views.ChapaTransferWebhookView.as_view(),
        name="chapa-transfer-webhook",
    ),
]
