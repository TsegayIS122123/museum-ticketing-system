"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).

All four views are Cashier-only (Document 02 Sec 2.5: "At the gate, the
Cashier looks up..."/"the Cashier records..."). Museum Manager and
Platform Admin are deliberately excluded here even though they are also
Staff -- gate operations are a Cashier-specific responsibility, unlike
`apps.bookings`' `IsStaff`-gated listing endpoint. UAT round 1 narrowed
what the Cashier can do at the gate: she can look up a booking, check in
a matching one, flag a mismatched one for the Museum Manager
(`FlagMismatchView`, new below), or record an IFMIS voucher reference --
she can no longer correct a mismatch herself (that moved to
`apps.bookings.views.BookingCategoryCorrectionView` and friends,
Manager-only).
"""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking
from apps.bookings.serializers import BookingSerializer
from apps.core.permissions import IsCashier

from . import services
from .serializers import (
    CheckInResponseSerializer,
    FlagMismatchRequestSerializer,
    IfmisVoucherUpdateSerializer,
)


class CheckInLookupView(APIView):
    """GET /bookings/lookup -- Cashier only (FR-TICKET-001, FR-TICKET-004).

    Mounted under /api/v1/ (config/urls.py), not /api/v1/entrance/, since
    Document 04 places this at `/bookings/lookup` -- the entrance module
    owns the business logic (Design Spec Sec 3.2) without owning that
    part of the URL namespace, mirroring how `bookings` owns
    `/availability` despite that also not living under its own prefix.
    """

    permission_classes = [IsCashier]

    @extend_schema(
        operation_id="lookupBookingByReference",
        parameters=[
            OpenApiParameter(
                "reference", str, location=OpenApiParameter.QUERY, required=True
            )
        ],
        responses=BookingSerializer,
    )
    def get(self, request):
        booking = services.lookup_booking_by_reference(
            reference=request.query_params.get("reference")
        )
        return Response(BookingSerializer(booking).data)


class CheckInView(APIView):
    """POST /bookings/{id}/check-in -- Cashier only
    (FR-TICKET-001 - FR-TICKET-003, FR-TICKET-005).

    Takes no request body (UAT round 1): the Cashier no longer supplies a
    per-item attended count here -- see `services.check_in_booking`'s own
    docstring for why a mismatch can no longer reach this call at all.
    409s if the booking is not `Pending`, or if it has an open mismatch
    flag (`FlagMismatchView` below) still awaiting a Manager correction.

    Returns `CheckInResponseSerializer`, not the plain `BookingSerializer`
    -- the IFMIS-decision build prompt's Step 7: the response carries the
    extra fields the Cashier needs to key this transaction into IFMIS
    herself (payer name, amount in figures/words, purpose string).
    `services.check_in_booking`'s own business logic and return value
    (the `Booking` instance) are unchanged; only how the response is
    *serialized* differs from every other endpoint that returns a
    `Booking`.
    """

    permission_classes = [IsCashier]

    @extend_schema(
        operation_id="checkInBooking",
        request=None,
        responses=CheckInResponseSerializer,
    )
    def post(self, request, id):
        booking = get_object_or_404(Booking.objects.select_related("visitor"), id=id)
        booking = services.check_in_booking(booking=booking, actor=request.user)
        return Response(CheckInResponseSerializer(booking).data)


class FlagMismatchView(APIView):
    """POST /bookings/{id}/flag-mismatch/ -- Cashier only (UAT round 1,
    Document 02 Sec 2.5's policy update).

    The other branch of the gate-side check-in decision, alongside
    `CheckInView` above: called instead of check-in when the party at the
    gate doesn't match what's booked. Puts the booking on the Museum
    Manager's flagged-booking queue (`GET /bookings?flagged=true`) for
    her to correct -- see `services.flag_booking_mismatch`'s own
    docstring for why this never touches a quantity/category field
    itself. 409s if the booking is not `Pending`.
    """

    permission_classes = [IsCashier]

    @extend_schema(
        operation_id="flagBookingMismatch",
        request=FlagMismatchRequestSerializer,
        responses=BookingSerializer,
    )
    def post(self, request, id):
        booking = get_object_or_404(Booking.objects.select_related("visitor"), id=id)
        serializer = FlagMismatchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.flag_booking_mismatch(
            booking=booking,
            actor=request.user,
            note=serializer.validated_data.get("note") or None,
        )
        return Response(BookingSerializer(booking).data)


class IfmisVoucherView(APIView):
    """PATCH /bookings/{id}/ifmis-voucher/ -- Cashier only, and only the
    same Cashier who checked this booking in (services.py enforces this,
    not this permission class -- it needs the specific booking, not just
    the role). Called after she's actually entered the transaction into
    IFMIS and gotten the real voucher reference back; settable once.
    """

    permission_classes = [IsCashier]

    @extend_schema(
        operation_id="recordIfmisVoucherReference",
        request=IfmisVoucherUpdateSerializer,
        responses=BookingSerializer,
    )
    def patch(self, request, id):
        booking = get_object_or_404(Booking.objects.select_related("visitor"), id=id)
        serializer = IfmisVoucherUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.record_ifmis_voucher_reference(
            booking=booking,
            actor=request.user,
            voucher_reference=serializer.validated_data["voucherReference"],
        )
        return Response(BookingSerializer(booking).data)
