"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).

Per the IFMIS decision (see docs/ decision summary): every endpoint here
except the webhook is Cashier-scoped to `request.user` -- there is no
"reconcile on behalf of another cashier" or platform-wide action, since
Chapa/IFMIS accountability is tied to the individual who checked visitors
in, not the platform as a whole.
"""

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import IsCashier
from apps.payments.services import verify_webhook_signature

from . import services
from .serializers import (
    CashierReconciliationSerializer,
    ChapaTransferWebhookSerializer,
    OutstandingBalanceSerializer,
)


class MyBalanceView(APIView):
    """GET /settlement/my-balance/ -- Cashier only. Her own outstanding
    balance (unreconciled Visited bookings minus unreconciled completed
    refunds) -- never a platform-wide total (IFMIS decision)."""

    permission_classes = [IsCashier]

    @extend_schema(
        operation_id="getMyOutstandingBalance",
        responses=OutstandingBalanceSerializer,
    )
    def get(self, request):
        balance = services.get_outstanding_balance(cashier=request.user)
        serializer = OutstandingBalanceSerializer({"balance_etb": balance})
        return Response(serializer.data)


class ReconcileView(APIView):
    """POST /settlement/reconcile/ -- Cashier only. The one-click action:
    locks her outstanding bookings/refunds, creates a `PENDING`
    reconciliation row, and calls Chapa's Transfer API to move her
    balance into the university's fixed bank account. A confirm dialog on
    the client is sufficient before calling this (no OTP step -- already
    decided); this endpoint itself performs no additional confirmation."""

    permission_classes = [IsCashier]

    @extend_schema(
        operation_id="initiateReconciliation",
        request=None,
        responses={201: CashierReconciliationSerializer},
    )
    def post(self, request):
        reconciliation = services.initiate_reconciliation(cashier=request.user)
        return Response(
            CashierReconciliationSerializer(reconciliation).data,
            status=status.HTTP_201_CREATED,
        )


class ReconciliationListView(generics.ListAPIView):
    """GET /settlement/reconciliations/ -- any authenticated Staff member.
    A Cashier sees only her own attempts; Museum Manager/Platform Admin
    see every cashier's (mirrors `apps.refunds.views.RefundListView`'s own
    ownership-scoping pattern)."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = EnvelopeLimitOffsetPagination
    serializer_class = CashierReconciliationSerializer

    def get_queryset(self):
        return services.list_reconciliations(user=self.request.user)

    @extend_schema(operation_id="listReconciliations")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class ChapaTransferWebhookView(APIView):
    """POST /settlement/webhook/chapa-transfer/ -- AllowAny + signature
    check (mirrors `apps.payments.views.ChapaWebhookView` exactly, same
    HMAC-SHA256-over-the-raw-body verification against
    `CHAPA_WEBHOOK_SECRET`). The only path that ever moves a
    reconciliation out of `PENDING` -- there is no client-side redirect
    for a bank transfer to (incorrectly) trust instead."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(
        operation_id="handleChapaTransferWebhook",
        request=ChapaTransferWebhookSerializer,
        responses={200: None, 400: None, 401: None},
    )
    def post(self, request, *args, **kwargs):
        signature = request.headers.get("Chapa-Signature") or request.headers.get(
            "X-Chapa-Signature"
        )
        if not verify_webhook_signature(raw_body=request.body, signature_header=signature):
            return Response(
                {
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Invalid webhook signature.",
                        "field_errors": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = ChapaTransferWebhookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # The full raw payload (not just validated_data) is passed through,
        # mirroring apps.payments.views.ChapaWebhookView -- Chapa's payout
        # payload carries fields beyond the ones validated here.
        services.handle_chapa_transfer_webhook(payload=request.data)
        return Response(status=status.HTTP_200_OK)
