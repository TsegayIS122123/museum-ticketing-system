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
    the Create/Cancel/Reschedule serializers below and services.py, never
    through this serializer directly."""

    visitorId = serializers.UUIDField(source="visitor_id", read_only=True)
    categoryId = serializers.UUIDField(source="category_id", read_only=True)
    # Bilingual name *snapshot* taken at booking time (see `models.Booking`
    # -- never a live join to `catalog.Category`), so a since-retired or
    # renamed category still displays correctly against a historical
    # booking. Previously stored on the model but never serialized --
    # every UI that needs a human-readable category name (the visitor's
    # own booking detail page, the Cashier's gate check-in screen) had no
    # way to get one from this endpoint.
    categoryNameEn = serializers.CharField(source="category_name_en", read_only=True)
    categoryNameAm = serializers.CharField(source="category_name_am", read_only=True)
    visitDate = serializers.DateField(source="visit_date", read_only=True)
    bookingType = serializers.CharField(source="booking_type", read_only=True)
    groupName = serializers.CharField(source="group_name", read_only=True, allow_null=True)
    # The number a Cashier can call/SMS to reach a group's requester
    # (FR-BOOK-003's `groupContactPhone`, collected at booking time but
    # never surfaced back out before now). Null for an individual
    # booking -- see `visitorPhone`/`visitorEmail` below for that case.
    groupContactPhone = serializers.CharField(
        source="group_contact_phone", read_only=True, allow_null=True
    )
    # The booking's own Visitor -- who a Cashier reaches for an
    # *individual* booking (a group booking instead has its own
    # `groupContactPhone` above, since the requester need not be one of
    # the attendees). Visible to the owning Visitor too, which is
    # harmless: it's just their own account's contact details reflected
    # back to them.
    visitorName = serializers.CharField(source="visitor.full_name", read_only=True)
    visitorEmail = serializers.CharField(source="visitor.email", read_only=True)
    visitorPhone = serializers.CharField(source="visitor.phone", read_only=True, allow_null=True)
    bookedQuantity = serializers.IntegerField(source="booked_quantity", read_only=True)
    attendedQuantity = serializers.IntegerField(
        source="attended_quantity", read_only=True, allow_null=True
    )
    rescheduledCount = serializers.IntegerField(source="rescheduled_count", read_only=True)
    # Set only once a Cashier has corrected this booking's category at
    # the gate (ID-verification addendum) -- null on every booking that
    # was never corrected.
    categoryCorrectedAt = serializers.DateTimeField(
        source="category_corrected_at", read_only=True, allow_null=True
    )
    noticeSentAt = serializers.DateTimeField(source="notice_sent_at", read_only=True, allow_null=True)
    checkoutUrl = serializers.CharField(
        source="chapa_checkout_url", read_only=True, allow_null=True
    )
    receiptUrl = serializers.CharField(source="receipt_url", read_only=True, allow_null=True)
    totalAmountEtb = serializers.DecimalField(
        source="total_amount_etb", read_only=True, max_digits=12, decimal_places=2
    )
    # The real Document No/Ref No the Cashier keys back in via `PATCH
    # /bookings/{id}/ifmis-voucher/` (apps.entrance) -- null until then.
    ifmisVoucherReference = serializers.CharField(
        source="ifmis_voucher_reference", read_only=True, allow_null=True
    )
    # Set only once this booking's amount has been swept into a
    # *completed* per-cashier reconciliation (apps.settlement) -- null
    # for every booking still outstanding on its cashier's ledger.
    reconciliationId = serializers.UUIDField(
        source="reconciliation_id", read_only=True, allow_null=True
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "reference",
            "visitorId",
            "categoryId",
            "categoryNameEn",
            "categoryNameAm",
            "visitDate",
            "bookingType",
            "groupName",
            "groupContactPhone",
            "visitorName",
            "visitorEmail",
            "visitorPhone",
            "bookedQuantity",
            "attendedQuantity",
            "status",
            "rescheduledCount",
            "categoryCorrectedAt",
            "noticeSentAt",
            "checkoutUrl",
            "receiptUrl",
            "ifmisVoucherReference",
            "reconciliationId",
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


class BookingRescheduleSerializer(serializers.Serializer):
    """`BookingRescheduleRequest` -- FR-BOOK-007."""

    newVisitDate = serializers.DateField()


class BookingCategoryCorrectionSerializer(serializers.Serializer):
    """`BookingCategoryCorrectionRequest` -- Cashier only (ID-verification
    addendum to Document 02 Sec 2.2). A plain Serializer, not a
    ModelSerializer, mirroring `BookingCreateSerializer` above: the
    single input is a new category, not a 1:1 model field mapping."""

    categoryId = serializers.UUIDField()

    def to_service_kwargs(self):
        return {"category_id": self.validated_data["categoryId"]}
