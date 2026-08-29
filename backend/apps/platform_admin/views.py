"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response

from apps.accounts.models import Account
from apps.accounts.serializers import AccountSerializer
from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import IsPlatformAdmin

from . import services
from .serializers import StaffCreateSerializer, StaffUpdateSerializer


class StaffListCreateView(generics.ListCreateAPIView):
    """`GET /admin/staff` and `POST /admin/staff` -- both Platform Admin
    only (FR-ACC-002)."""

    permission_classes = [IsPlatformAdmin]
    pagination_class = EnvelopeLimitOffsetPagination

    def get_serializer_class(self):
        if self.request.method == "POST":
            return StaffCreateSerializer
        return AccountSerializer

    def get_queryset(self):
        return services.list_staff()

    @extend_schema(request=StaffCreateSerializer, responses=AccountSerializer)
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = services.create_staff_account(actor=request.user, **serializer.validated_data)
        return Response(AccountSerializer(account).data, status=status.HTTP_201_CREATED)


class StaffDetailView(generics.GenericAPIView):
    """`PUT /admin/staff/{id}` and `DELETE /admin/staff/{id}` -- both
    Platform Admin only (FR-ACC-002). No `GET` here: Document 04 has no
    single-staff-account retrieve endpoint, only the list at
    `/admin/staff` (mirrors `apps.catalog.CategoryDetailView`)."""

    permission_classes = [IsPlatformAdmin]
    queryset = Account.objects.all()
    lookup_field = "id"
    serializer_class = StaffUpdateSerializer

    @extend_schema(request=StaffUpdateSerializer, responses=AccountSerializer)
    def put(self, request, id):
        account = self.get_object()
        serializer = StaffUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        account = services.update_staff_account(
            actor=request.user, account=account, **serializer.validated_data
        )
        return Response(AccountSerializer(account).data)

    @extend_schema(responses=None)
    def delete(self, request, id):
        account = self.get_object()
        services.deactivate_staff_account(actor=request.user, account=account)
        return Response(status=status.HTTP_204_NO_CONTENT)
