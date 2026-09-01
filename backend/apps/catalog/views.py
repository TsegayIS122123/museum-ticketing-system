"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import IsMuseumManager

from . import services
from .models import Category
from .serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CategoryUpdateSerializer,
)


class CategoryListCreateView(generics.ListCreateAPIView):
    """GET /categories (FR-CAT-001, public, no auth) and POST /categories
    (FR-CAT-002, Museum Manager only).

    GET also accepts `?active=all` -- Museum Manager only (silently
    ignored for anyone else, rather than erroring, so a stale link
    doesn't break for a Visitor) -- to include retired categories, so a
    Manager can find one again to reactivate it. Default behavior
    (active-only, cached) is unchanged for every other caller.
    """

    pagination_class = EnvelopeLimitOffsetPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsMuseumManager()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return CategoryCreateSerializer
        return CategorySerializer

    def get_queryset(self):
        # Cached, active-only list (services.py) -- retired categories
        # never appear here; they still exist for `booking` FK integrity.
        # Exception: `?active=all` from an authenticated Museum Manager.
        wants_all = self.request.query_params.get("active") == "all"
        if wants_all and IsMuseumManager().has_permission(self.request, self):
            return services.list_all_categories_for_manager()
        return services.list_active_categories()

    @extend_schema(request=CategoryCreateSerializer, responses=CategorySerializer)
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = services.create_category(**serializer.validated_data)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(generics.GenericAPIView):
    """PUT /categories/{id} and DELETE /categories/{id} -- both Museum
    Manager only (FR-CAT-002). No GET here: Document 04 has no single-
    category retrieve endpoint, only the list at /categories."""

    permission_classes = [IsMuseumManager]
    queryset = Category.objects.all()
    lookup_field = "id"
    serializer_class = CategoryUpdateSerializer

    @extend_schema(request=CategoryUpdateSerializer, responses=CategorySerializer)
    def put(self, request, id):
        category = self.get_object()
        serializer = CategoryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = services.update_category(category=category, **serializer.validated_data)
        return Response(CategorySerializer(category).data)

    @extend_schema(responses=None)
    def delete(self, request, id):
        category = self.get_object()
        services.retire_category(category=category)
        return Response(status=status.HTTP_204_NO_CONTENT)
