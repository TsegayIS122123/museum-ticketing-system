"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from datetime import date as _date

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import EnvelopeLimitOffsetPagination
from apps.core.permissions import (
    IsMuseumManager,
    IsMuseumManagerOrPlatformAdmin,
    IsStaff,
    IsVisitor,
)

from . import services
from .models import Booking
from .serializers import (
    BookingCategoryCorrectionBatchSerializer,
    BookingCategoryCorrectionSerializer,
    BookingItemAddSerializer,
    BookingCreateSerializer,
    BookingRescheduleSerializer,
    BookingSerializer,
    BookingUpdateSerializer,
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
            flagged=params.get("flagged") == "true",
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
        # Every booking (individual, FR-BOOK-001, or group, FR-BOOK-003)
        # leaves create_booking as awaiting_payment -- there is no
        # approval gate in between. Local import: apps.payments depends
        # on apps.bookings, not the reverse (Design Spec Sec 3.2) -- this
        # view layer is what composes both, never bookings/services.py
        # itself.
        from apps.payments.services import create_checkout_session

        create_checkout_session(booking=booking)
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingDetailView(generics.RetrieveAPIView):
    """GET /bookings/{id} -- the owning Visitor or any Staff member.

    Also handles PATCH /bookings/{id} -- the owning Visitor only, editing
    their own booking's ticket mix and/or visit date while it's still
    `AwaitingPayment` (see `BookingUpdateSerializer`/`services.
    update_awaiting_payment_booking`). Kept on the same resource/URL as
    the GET above rather than a separate endpoint, since it's the same
    `Booking` -- just a different HTTP method and a narrower audience."""

    permission_classes = [permissions.IsAuthenticated]
    # select_related("visitor") -- BookingSerializer now reads
    # visitor.full_name/email/phone (visitorName/visitorEmail/
    # visitorPhone) for every row, so this avoids an extra query per
    # request that would otherwise go unnoticed (this view returns one
    # row at a time). prefetch_related("items") -- same reasoning, for
    # the per-category line-item list (`items`).
    queryset = Booking.objects.select_related("visitor").prefetch_related("items")
    lookup_field = "id"
    serializer_class = BookingSerializer

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsVisitor()]
        return [permission() for permission in self.permission_classes]

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

    @extend_schema(
        operation_id="updateBooking", request=BookingUpdateSerializer, responses=BookingSerializer
    )
    def patch(self, request, *args, **kwargs):
        # Fetched directly, not via self.get_object() -- that method's
        # owner-or-staff check above is deliberately broader (any Staff
        # member can view) than what an edit needs (owning Visitor only,
        # and only while still AwaitingPayment), and
        # services.update_awaiting_payment_booking already enforces both
        # of those itself, the same way BookingCancelView/
        # BookingRescheduleView below fetch by id alone and let the
        # service raise.
        booking = get_object_or_404(Booking, id=kwargs["id"])
        serializer = BookingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.update_awaiting_payment_booking(
            booking=booking, visitor=request.user, **serializer.to_service_kwargs()
        )

        # The booking's total may have just changed. Any checkout session
        # already open against it (from BookingListCreateView.post at
        # creation time) was opened against the *old* total, and
        # create_checkout_session's own idempotency guard would otherwise
        # hand that stale session straight back rather than reflecting
        # the edit -- so the stale one is invalidated first. Local
        # imports: apps.payments depends on apps.bookings, not the
        # reverse (Design Spec Sec 3.2) -- this view layer is what
        # composes both, never bookings/services.py itself (see
        # BookingListCreateView.post's identical rationale).
        from apps.payments.services import create_checkout_session, invalidate_open_checkout_sessions

        invalidate_open_checkout_sessions(booking=booking)
        create_checkout_session(booking=booking)

        return Response(BookingSerializer(booking).data)


class BookingReceiptDownloadView(APIView):
    """GET /bookings/{id}/receipt/download/ -- the owning Visitor or any
    Staff member (same access rule as BookingDetailView).

    `booking.receipt_url` (exposed as `receiptUrl` on BookingSerializer)
    is a direct link straight to storage, used to *view* the PDF in a
    new tab. It isn't a reliable target for a forced download initiated
    from frontend JS: browser navigation to it works fine, but a
    scripted `fetch()` of it can be blocked by CORS (storage is served
    by the reverse proxy/object storage in staging/production, not this
    Django app -- see config/urls.py) or by mixed-content restrictions
    if that storage host isn't on HTTPS. Streaming the same bytes back
    through this API host instead -- which the frontend already talks
    to successfully for everything else -- sidesteps both, and
    `as_attachment=True` makes the browser save it regardless of how
    the response is loaded.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        user = request.user
        is_owner = getattr(user, "role", None) == "visitor" and booking.visitor_id == user.id
        is_staff = IsStaff().has_permission(request, self)
        if not (is_owner or is_staff):
            self.permission_denied(request)

        if not booking.receipt_url:
            raise Http404("No receipt has been generated for this booking yet.")

        # Local import: apps.payments depends on apps.bookings, not the
        # reverse (Design Spec Sec 3.2) -- see BookingListCreateView.post
        # for the same rationale applied to create_checkout_session.
        from apps.payments.tasks import _RECEIPT_STORAGE_PATH

        storage_path = _RECEIPT_STORAGE_PATH.format(booking_id=booking.id)
        if not default_storage.exists(storage_path):
            raise Http404("Receipt file is missing from storage.")

        return FileResponse(
            default_storage.open(storage_path, "rb"),
            as_attachment=True,
            filename=f"receipt-{booking.reference}.pdf",
            content_type="application/pdf",
        )


class BookingCancelView(APIView):
    """POST /bookings/{id}/cancel -- FR-BOOK-005/006 for a `Pending`
    (i.e. already paid) booking.

    Also reachable against a still-unpaid `AwaitingPayment` booking, as
    the delete half of the Visitor's own pre-payment editing capability
    alongside `BookingDetailView.patch` above -- deliberately the same
    endpoint rather than a separate one, since "cancel" is the right verb
    either way; only the consequence (refund, or not) differs."""

    permission_classes = [IsVisitor]

    @extend_schema(request=None, responses=BookingSerializer)
    def post(self, request, id):
        booking = get_object_or_404(Booking, id=id)

        if booking.status == Booking.Status.AWAITING_PAYMENT:
            # Nothing has been paid for yet -- a plain status change,
            # with no apps.refunds call anywhere on this path (see
            # services.cancel_awaiting_payment_booking's own docstring).
            booking = services.cancel_awaiting_payment_booking(booking=booking, visitor=request.user)
            return Response(BookingSerializer(booking).data)

        booking = services.cancel_booking(booking=booking, visitor=request.user)
        # FR-BOOK-006: cancelling a Pending booking triggers a full,
        # automatic refund. Local import: apps.refunds depends on
        # apps.bookings, not the reverse (Design Spec Sec 3.2) -- this
        # view layer is what composes both, never bookings/services.py
        # itself (see BookingListCreateView.post's identical rationale
        # for apps.payments).
        from apps.refunds.services import trigger_cancellation_refund

        trigger_cancellation_refund(booking=booking)
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


class BookingCategoryCorrectionView(APIView):
    """PATCH /bookings/{id}/category-correction -- Museum Manager (or
    Platform Admin) only (ID-verification addendum to Document 02 Sec
    2.2; re-permissioned from the Cashier in UAT round 1 -- see
    `services.correct_booking_category`'s own docstring for the policy
    change).

    Corrects a booking item's category and/or quantity -- category, when
    the visitor's ID at the gate doesn't match what they booked under;
    quantity, when the actual headcount for that item doesn't match what
    was booked (either direction) -- then either reopens payment for the
    difference (undercharge) or issues a refund for the difference
    (overcharge). Reached from the Manager's flagged-booking queue
    (`GET /bookings?flagged=true`) or on her own initiative. Lives here,
    not in `apps.entrance` -- even though it's a gate-side action --
    because this is where that composition with `apps.payments`/
    `apps.refunds` already happens (`BookingListCreateView.post`/
    `BookingCancelView` above); `entrance` depends on `bookings` only,
    with no dependency of its own on `refunds`/`payments`
    (`apps.entrance.services`' own module docstring), so putting this
    endpoint there would violate that boundary. See
    `services.correct_booking_category`'s own docstring for the full
    rationale."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(
        request=BookingCategoryCorrectionSerializer, responses=BookingSerializer
    )
    def patch(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        serializer = BookingCategoryCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking, delta = services.correct_booking_category(
            booking=booking, actor=request.user, **serializer.to_service_kwargs()
        )

        # Local imports: see BookingListCreateView.post/BookingCancelView
        # above for why apps.payments/apps.refunds are only ever imported
        # here, at the view layer, never from bookings/services.py.
        if delta > 0:
            from apps.payments.services import create_checkout_session

            create_checkout_session(booking=booking, amount=delta)
        elif delta < 0:
            from apps.refunds.services import trigger_category_correction_refund

            trigger_category_correction_refund(
                booking=booking, amount=-delta, actor=request.user
            )

        return Response(BookingSerializer(booking).data)


class BookingCategoryCorrectionBatchView(APIView):
    """PATCH /bookings/{id}/category-corrections/batch -- Museum Manager
    (or Platform Admin) only (ID-verification addendum, batch extension;
    re-permissioned from the Cashier in UAT round 1).

    Batch sibling of `BookingCategoryCorrectionView`/`BookingItemAddView`
    above: accepts a list of the same per-item edit/add shapes those two
    single-item endpoints take, and applies the whole list as one atomic
    correction with a single combined delta. This is what actually fixes
    the gate-workflow gap those two single-item endpoints have -- a
    Manager who needs to bump two categories' headcounts in the same
    visit (both undercharges) previously couldn't, because the first
    single-item PATCH flips the booking out of `Pending` and the second
    then 409s. See `services.apply_booking_corrections`'s own docstring
    for the full rationale, including how it orders category-moves within
    the batch and rejects an unresolvable two-way swap."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(
        request=BookingCategoryCorrectionBatchSerializer, responses=BookingSerializer
    )
    def patch(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        serializer = BookingCategoryCorrectionBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking, delta = services.apply_booking_corrections(
            booking=booking, actor=request.user, ops=serializer.to_service_ops()
        )

        # Local imports: see BookingCategoryCorrectionView above for why
        # apps.payments/apps.refunds are only ever imported here, at the
        # view layer, never from bookings/services.py. One call either
        # way, for the batch's single combined delta -- never one per op.
        if delta > 0:
            from apps.payments.services import create_checkout_session

            create_checkout_session(booking=booking, amount=delta)
        elif delta < 0:
            from apps.refunds.services import trigger_category_correction_refund

            trigger_category_correction_refund(
                booking=booking, amount=-delta, actor=request.user
            )

        return Response(BookingSerializer(booking).data)


class BookingItemAddView(APIView):
    """POST /bookings/{id}/items -- Museum Manager (or Platform Admin)
    only (walk-up addendum to the ID-verification correction flow;
    re-permissioned from the Cashier in UAT round 1).

    Adds a brand-new line for a category that wasn't on the booking at
    all -- e.g. a group booked as 3 Students shows up with 2 Adults never
    part of the original booking -- then reopens payment for the new
    item's full price. See `services.add_booking_item`'s own docstring
    for why this is a distinct operation from
    `BookingCategoryCorrectionView`, which only ever edits an existing
    line. Lives here for the same `apps.payments` composition/module-
    boundary reasons as `BookingCategoryCorrectionView` above."""

    permission_classes = [IsMuseumManagerOrPlatformAdmin]

    @extend_schema(request=BookingItemAddSerializer, responses=BookingSerializer)
    def post(self, request, id):
        booking = get_object_or_404(Booking, id=id)
        serializer = BookingItemAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking, new_item = services.add_booking_item(
            booking=booking, actor=request.user, **serializer.to_service_kwargs()
        )

        # Local import: see BookingListCreateView.post/BookingCancelView/
        # BookingCategoryCorrectionView above for why apps.payments is
        # only ever imported here, at the view layer.
        from apps.payments.services import create_checkout_session

        create_checkout_session(booking=booking, amount=new_item.subtotal_etb)

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
