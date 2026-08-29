"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from datetime import date as _date

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import IsMuseumManager, IsStaff, IsVisitor

from . import services
from .models import Booking
from .serializers import (
    BookingApprovalSerializer,
    BookingCreateSerializer,
    BookingRescheduleSerializer,
    BookingSerializer,
    DateAvailabilitySerializer,
    DateAvailabilityUpdateSerializer,
)


def _parse_required_date(request, param):
    raw = request.query_params.get(param)
    if not raw:
        raise ValidationError({param: "This query parameter is required."})
    try:
        return _date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({param: "Must be an ISO-8601 date (YYYY-MM-DD)."})


class AvailabilityListView(APIView):
    """GET /availability -- public (FR-BOOK-008)."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=DateAvailabilitySerializer(many=True))
    def get(self, request):
        date_from = _parse_required_date(request, "from")
        date_to = _parse_required_date(request, "to")
        rows = services.list_date_availability(date_from=date_from, date_to=date_to)
        return Response(DateAvailabilitySerializer(rows, many=True).data)


class AvailabilityDetailView(APIView):
    """PUT /availability/{date} -- Museum Manager only (FR-BOOK-008)."""

    permission_classes = [IsMuseumManager]

    @extend_schema(request=DateAvailabilityUpdateSerializer, responses=DateAvailabilitySerializer)
    def put(self, request, date):
        try:
            visit_date = _date.fromisoformat(date)
        except ValueError:
            raise ValidationError({"date": "Must be an ISO-8601 date (YYYY-MM-DD)."})
        serializer = DateAvailabilityUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = services.set_date_availability(
            visit_date=visit_date,
            is_open_for_booking=serializer.validated_data["isOpenForBooking"],
            actor=request.user,
        )
        return Response(DateAvailabilitySerializer(row).data)


class BookingListCreateView(generics.GenericAPIView):
    """GET /bookings (Staff only) and POST /bookings (Visitor only,
    FR-BOOK-001/FR-BOOK-003)."""

    pagination_class = EnvelopeLimitOffsetPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsVisitor()]
        return [IsStaff()]

    def get_throttles(self):
        # Sec 6.7: capped per account/IP against fraudulent
        # AwaitingPayment bookings -- POST only, so staff listing traffic
        # is never rate-limited by the same bucket.
        if self.request.method == "POST":
            self.throttle_scope = "booking-create"
            return [t() for t in self.throttle_classes]
        return []

    def get_queryset(self):
        params = self.request.query_params
        return services.list_bookings_for_staff(
            status=params.get("status"),
            visit_date=params.get("visitDate"),
            booking_type=params.get("bookingType"),
        )

    @extend_schema(operation_id="listBookings", responses=BookingSerializer)
    def get(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(BookingSerializer(page, many=True).data)

    @extend_schema(
        operation_id="createBooking", request=BookingCreateSerializer, responses=BookingSerializer
    )
    def post(self, request):
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.create_booking(
            visitor=request.user, **serializer.to_service_kwargs()
        )
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingDetailView(generics.RetrieveAPIView):
    """GET /bookings/{id} -- the owning Visitor or any Staff member."""

    permission_classes = [permissions.IsAuthenticated]
    queryset = Booking.objects.all()
    lookup_field = "id"
    serializer_class = BookingSerializer

    @extend_schema(operation_id="getBooking")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_object(self):
        booking = super().get_object()
        user = self.request.user
        is_owner = getattr(user, "role", None) == "visitor" and booking.visitor_id == user.id
        is_staff = IsStaff().has_permission(self.request, self)
        if not (is_owner or is_staff):
            self.permission_denied(self.request)
        return booking


class BookingApprovalView(APIView):
    """PUT /bookings/{id}/approval -- Museum Manager only (FR-BOOK-003)."""

    permission_classes = [IsMuseumManager]

    @extend_schema(request=BookingApprovalSerializer, responses=BookingSerializer)
    def put(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        serializer = BookingApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.decide_group_booking(
            booking=booking, actor=request.user, **serializer.validated_data
        )
        return Response(BookingSerializer(booking).data)


class BookingCancelView(APIView):
    """POST /bookings/{id}/cancel -- FR-BOOK-005/006."""

    permission_classes = [IsVisitor]

    @extend_schema(request=None, responses=BookingSerializer)
    def post(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        booking = services.cancel_booking(booking=booking, visitor=request.user)
        return Response(BookingSerializer(booking).data)


class BookingRescheduleView(APIView):
    """POST /bookings/{id}/reschedule -- FR-BOOK-007."""

    permission_classes = [IsVisitor]

    @extend_schema(request=BookingRescheduleSerializer, responses=BookingSerializer)
    def post(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        serializer = BookingRescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.reschedule_booking(
            booking=booking,
            visitor=request.user,
            new_visit_date=serializer.validated_data["newVisitDate"],
        )
        return Response(BookingSerializer(booking).data)


class MyBookingsView(generics.ListAPIView):
    """GET /users/me/bookings -- FR-ACC-004. Mounted at the root URLconf
    (config/urls.py), not here, mirroring CurrentUserView's placement --
    Document 04 puts this under `/users/`, not `/bookings/`."""

    permission_classes = [IsVisitor]
    pagination_class = EnvelopeLimitOffsetPagination
    serializer_class = BookingSerializer

    def get_queryset(self):
        return services.list_my_bookings(
            visitor=self.request.user, status=self.request.query_params.get("status")
        )

    @extend_schema(operation_id="listMyBookings")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
