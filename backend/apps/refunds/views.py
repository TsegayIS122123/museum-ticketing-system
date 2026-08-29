"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking
from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import IsVisitor

from . import services
from .serializers import RefundRequestCreateSerializer, RefundSerializer


class RefundRequestView(APIView):
    """POST /bookings/{id}/refund-requests -- Visitor only
    (FR-TICKET-002, FR-REFUND-001b). Mounted under the top-level
    `/bookings/{id}/` path (see `apps.refunds.urls`'s
    `refund_request_urlpatterns`), even though `refunds` owns the
    business logic behind it -- mirrors how `apps.entrance`'s
    Cashier-facing endpoints live at `/bookings/...` despite that app
    owning FR-TICKET, not `apps.bookings`.
    """

    permission_classes = [IsVisitor]

    @extend_schema(
        operation_id="requestPartialRefund",
        request=RefundRequestCreateSerializer,
        responses={201: RefundSerializer},
    )
    def post(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        serializer = RefundRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refund = services.request_partial_shortfall_refund(
            booking=booking,
            visitor=request.user,
            note=serializer.validated_data.get("note") or None,
        )
        return Response(RefundSerializer(refund).data, status=201)


class RefundListView(generics.ListAPIView):
    """GET /refunds -- any authenticated user (Visitors see only their
    own; Staff can filter across all, Document 04)."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = EnvelopeLimitOffsetPagination
    serializer_class = RefundSerializer

    def get_queryset(self):
        return services.list_refunds(
            user=self.request.user, reason=self.request.query_params.get("reason")
        )

    @extend_schema(operation_id="listRefunds")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
