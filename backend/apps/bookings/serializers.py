"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.
"""

from rest_framework import serializers

from .models import Booking, DateAvailability


class DateAvailabilitySerializer(serializers.ModelSerializer):
    """`DateAvailability` (Document 04). Read-only -- every mutation goes
    through `DateAvailabilityUpdateSerializer` and services.py."""

    date = serializers.DateField(source="visit_date")
    isOpenForBooking = serializers.BooleanField(source="is_open_for_booking")
    closedByUserId = serializers.UUIDField(source="closed_by_user_id_id", allow_null=True)
    closedAt = serializers.DateTimeField(source="closed_at", allow_null=True)

    class Meta:
        model = DateAvailability
        fields = ["date", "isOpenForBooking", "closedByUserId", "closedAt"]


class DateAvailabilityUpdateSerializer(serializers.Serializer):
    """`DateAvailabilityUpdateRequest` -- Museum Manager only (FR-BOOK-008)."""

    isOpenForBooking = serializers.BooleanField()


class BookingSerializer(serializers.ModelSerializer):
    """`Booking` (Document 04). Read-only -- every mutation goes through
    the Create/Approval/Cancel/Reschedule serializers below and
    services.py, never through this serializer directly."""

    visitorId = serializers.UUIDField(source="visitor_id", read_only=True)
    categoryId = serializers.UUIDField(source="category_id", read_only=True)
    visitDate = serializers.DateField(source="visit_date", read_only=True)
    bookingType = serializers.CharField(source="booking_type", read_only=True)
    groupName = serializers.CharField(source="group_name", read_only=True, allow_null=True)
    bookedQuantity = serializers.IntegerField(source="booked_quantity", read_only=True)
    attendedQuantity = serializers.IntegerField(
        source="attended_quantity", read_only=True, allow_null=True
    )
    approvalStatus = serializers.CharField(
        source="approval_status", read_only=True, allow_null=True
    )
    rescheduledCount = serializers.IntegerField(source="rescheduled_count", read_only=True)
    noticeSentAt = serializers.DateTimeField(source="notice_sent_at", read_only=True, allow_null=True)
    checkoutUrl = serializers.CharField(
        source="chapa_checkout_url", read_only=True, allow_null=True
    )
    receiptUrl = serializers.CharField(source="receipt_url", read_only=True, allow_null=True)
    totalAmountEtb = serializers.DecimalField(
        source="total_amount_etb", read_only=True, max_digits=12, decimal_places=2
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "reference",
            "visitorId",
            "categoryId",
            "visitDate",
            "bookingType",
            "groupName",
            "bookedQuantity",
            "attendedQuantity",
            "status",
            "approvalStatus",
            "rescheduledCount",
            "noticeSentAt",
            "checkoutUrl",
            "receiptUrl",
            "totalAmountEtb",
            "createdAt",
        ]
        read_only_fields = fields


class BookingCreateSerializer(serializers.Serializer):
    """`BookingCreateRequest` -- FR-BOOK-001 (individual), FR-BOOK-003
    (group). A plain Serializer, not a ModelSerializer: `visitor` is
    supplied by the view from `request.user`, never from the request
    body, and `categoryId`/`bookingType` need their own field names
    mapped onto services.create_booking's kwargs rather than a 1:1 model
    field mapping."""

    visitDate = serializers.DateField()
    categoryId = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    bookingType = serializers.ChoiceField(choices=Booking.BookingType.choices)
    groupName = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    groupContactPhone = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        if attrs["bookingType"] == Booking.BookingType.GROUP and not attrs.get("groupName"):
            raise serializers.ValidationError(
                {"groupName": "Required when bookingType is group."}
            )
        return attrs

    def to_service_kwargs(self):
        return {
            "category_id": self.validated_data["categoryId"],
            "visit_date": self.validated_data["visitDate"],
            "quantity": self.validated_data["quantity"],
            "booking_type": self.validated_data["bookingType"],
            "group_name": self.validated_data.get("groupName") or None,
            "group_contact_phone": self.validated_data.get("groupContactPhone") or None,
        }


class BookingApprovalSerializer(serializers.Serializer):
    """`BookingApprovalRequest` -- Museum Manager only (FR-BOOK-003)."""

    decision = serializers.ChoiceField(choices=["approve", "decline"])
    note = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class BookingRescheduleSerializer(serializers.Serializer):
    """`BookingRescheduleRequest` -- FR-BOOK-007."""

    newVisitDate = serializers.DateField()
