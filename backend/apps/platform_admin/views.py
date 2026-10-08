"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, status
from rest_framework.response import Response

from apps.accounts.models import Account
from apps.accounts.serializers import AccountSerializer
from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import IsPlatformAdmin

from . import services
from .serializers import (
    AuditLogEntrySerializer,
    StaffCreateSerializer,
    StaffUpdateSerializer,
)


# NOTE on the `post=` schema override below: `ListCreateAPIView` (see
# rest_framework.generics) defines `post()` itself --
#   def post(self, request, *args, **kwargs):
#       return self.create(request, *args, **kwargs)
# -- and `StaffListCreateView` never overrides `post`, only `create`.
# drf-spectacular's AutoSchema resolves each operation from the view's
# actual HTTP-verb handler method (`post`, via getattr(view, "post")),
# not from whatever internal method that handler happens to delegate to.
# A `@extend_schema(...)` decorator placed on `create()` (as this used to
# be) therefore has no attached `_spectacular_annotation` to find when
# spectacular introspects `post` -- it silently falls back to
# `get_serializer_class()`'s POST branch (`StaffCreateSerializer`) for
# *both* request and response, even though `create()` genuinely returns
# `AccountSerializer(account).data` at runtime. `extend_schema_view` at
# the class level attaches the override to `post` directly, where
# spectacular actually looks -- confirmed via `manage.py spectacular`
# that operation `v1_admin_staff_create`'s 201 response now schemas as
# `Account`, not `StaffCreate`.
@extend_schema_view(
    post=extend_schema(request=StaffCreateSerializer, responses=AccountSerializer),
)
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


class AuditLogListView(generics.ListAPIView):
    """`GET /admin/audit-log` -- Platform Admin only, read-only
    (FR-AUDIT-001). The append-only trail every module writes through
    `core.services.write_audit_log`, filterable and paginated."""

    permission_classes = [IsPlatformAdmin]
    pagination_class = EnvelopeLimitOffsetPagination
    serializer_class = AuditLogEntrySerializer

    def get_queryset(self):
        params = self.request.query_params
        return services.list_audit_log(
            actor=params.get("actor"),
            action=params.get("action"),
            entity_type=params.get("entityType"),
            entity_id=params.get("entityId"),
            date_from=params.get("from"),
            date_to=params.get("to"),
        )

    @extend_schema(
        operation_id="listAuditLog",
        parameters=[
            OpenApiParameter(
                name="actor",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filter by acting account UUID.",
            ),
            OpenApiParameter(
                name="action",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filter by action, e.g. `booking.cancelled`.",
            ),
            OpenApiParameter(
                name="entityType",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filter by the audited entity's type, e.g. `account`.",
            ),
            OpenApiParameter(
                name="entityId",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filter by the audited entity's id.",
            ),
            OpenApiParameter(
                name="from",
                type=OpenApiTypes.DATETIME,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Only entries created at/after this ISO-8601 instant.",
            ),
            OpenApiParameter(
                name="to",
                type=OpenApiTypes.DATETIME,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Only entries created at/before this ISO-8601 instant.",
            ),
        ],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
