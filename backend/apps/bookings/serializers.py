"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.
"""

from rest_framework import serializers

from .models import Booking, BookingItem, DateAvailability


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


class BookingItemSerializer(serializers.ModelSerializer):
    """`BookingItem` (Document 04/05) -- one visitor category plus how
    many tickets of it were bought, one entry per category on a
    `Booking`. Read-only, same as `BookingSerializer` itself: line items
    are only ever created together with their parent booking (in
    `services.create_booking`) or corrected in place (`services.
    correct_booking_category`), never mutated directly through this
    serializer.
    """

    id = serializers.UUIDField(read_only=True)
    categoryId = serializers.UUIDField(source="category_id", read_only=True)
    categoryNameEn = serializers.CharField(source="category_name_en", read_only=True)
    categoryNameAm = serializers.CharField(source="category_name_am", read_only=True)
    unitPriceEtb = serializers.DecimalField(
        source="unit_price_etb", read_only=True, max_digits=12, decimal_places=2
    )
    subtotalEtb = serializers.DecimalField(
        source="subtotal_etb", read_only=True, max_digits=12, decimal_places=2
    )
    # Per-category headcount recorded by `apps.entrance.services.
    # check_in_booking` -- null until this item's booking is checked in
    # (see the field's own comment on the model). Feeds the Cashier's
    # attendance-entry screen (pre-filled per category) and lets
    # `apps.refunds.services.compute_refundable_amount` refund a
    # shortfall at this item's own `unitPriceEtb` rather than a blended
    # average across the booking's other categories (FR-REFUND-002).
    attendedQuantity = serializers.IntegerField(
        source="attended_quantity", read_only=True, allow_null=True
    )

    class Meta:
        model = BookingItem
        fields = [
            "id",
            "categoryId",
            "categoryNameEn",
            "categoryNameAm",
            "quantity",
            "attendedQuantity",
            "unitPriceEtb",
            "subtotalEtb",
        ]
        read_only_fields = fields


class BookingSerializer(serializers.ModelSerializer):
    """`Booking` (Document 04). Read-only -- every mutation goes through
    the Create/Cancel/Reschedule/CategoryCorrection serializers below and
    services.py, never through this serializer directly."""

    visitorId = serializers.UUIDField(source="visitor_id", read_only=True)
    # One entry per visitor category on this booking (see `BookingItem`
    # -- a booking mixing categories, e.g. one Adult plus two Student
    # tickets bought together, has more than one entry here). Previously
    # a single categoryId/categoryNameEn/categoryNameAm trio lived
    # directly on this serializer, back when a booking could only ever
    # hold one category.
    items = BookingItemSerializer(many=True, read_only=True)
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
    # The institutional payer's TIN (Tax Identification Number) --
    # required on a group booking, always null on an individual one. See
    # `Booking.group_tin`'s own field comment for why (IFMIS
    # reconciliation).
    groupTin = serializers.CharField(source="group_tin", read_only=True, allow_null=True)
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
            "items",
            "visitDate",
            "bookingType",
            "groupName",
            "groupContactPhone",
            "groupTin",
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


class BookingCreateItemSerializer(serializers.Serializer):
    """One `{categoryId, quantity}` entry of a `BookingCreateRequest`'s
    `items` list -- see `BookingCreateSerializer` below."""

    categoryId = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class BookingCreateSerializer(serializers.Serializer):
    """`BookingCreateRequest` -- FR-BOOK-001 (individual), FR-BOOK-003
    (group). A plain Serializer, not a ModelSerializer: `visitor` is
    supplied by the view from `request.user`, never from the request
    body, and `items`/`bookingType` need their own field names mapped
    onto services.create_booking's kwargs rather than a 1:1 model field
    mapping.

    `items` replaces the old single `categoryId`/`quantity` pair -- a
    booking can now mix categories (one Adult plus two Student tickets in
    the same checkout) instead of being limited to one category with a
    plain headcount. `min_length=1`: every booking still needs at least
    one category, same as before.
    """

    visitDate = serializers.DateField()
    items = BookingCreateItemSerializer(many=True, min_length=1)
    bookingType = serializers.ChoiceField(choices=Booking.BookingType.choices)
    groupName = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    groupContactPhone = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    # Required alongside groupName for a group booking -- the
    # institutional payer's TIN, needed for the finance office's IFMIS
    # receipt voucher (see `Booking.group_tin`'s own field comment).
    # Optional/blank here at the field level for the same reason
    # groupName is: the real requiredness is bookingType-conditional,
    # enforced below in `validate`, not a plain `required=True`.
    groupTin = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        if attrs["bookingType"] == Booking.BookingType.GROUP and not attrs.get("groupName"):
            raise serializers.ValidationError(
                {"groupName": "Required when bookingType is group."}
            )
        if attrs["bookingType"] == Booking.BookingType.GROUP and not attrs.get("groupTin"):
            raise serializers.ValidationError(
                {"groupTin": "Required when bookingType is group."}
            )
        return attrs

    def to_service_kwargs(self):
        return {
            "items": [
                {"category_id": item["categoryId"], "quantity": item["quantity"]}
                for item in self.validated_data["items"]
            ],
            "visit_date": self.validated_data["visitDate"],
            "booking_type": self.validated_data["bookingType"],
            "group_name": self.validated_data.get("groupName") or None,
            "group_contact_phone": self.validated_data.get("groupContactPhone") or None,
            "group_tin": self.validated_data.get("groupTin") or None,
        }


class BookingRescheduleSerializer(serializers.Serializer):
    """`BookingRescheduleRequest` -- FR-BOOK-007."""

    newVisitDate = serializers.DateField()


class BookingCategoryCorrectionSerializer(serializers.Serializer):
    """`BookingCategoryCorrectionRequest` -- Cashier only (ID-verification
    addendum to Document 02 Sec 2.2). `itemId` identifies which of the
    booking's `BookingItem` line items to correct -- see
    `services.correct_booking_category`'s own docstring for why a
    mixed-category booking needs this instead of assuming there's only
    ever one category to correct.

    `categoryId`/`quantity` are each optional at this field-shape layer
    -- a Cashier may be fixing just the category (bad ID), just the
    headcount for that item (e.g. 3 tickets bought under it but only 2
    people showed up), or both together. Requiring at least one of them
    is a cross-field rule, not a per-field one, so it's enforced in
    `validate` below rather than with `required=True` on either field.
    """

    itemId = serializers.UUIDField()
    categoryId = serializers.UUIDField(required=False)
    quantity = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        if "categoryId" not in attrs and "quantity" not in attrs:
            raise serializers.ValidationError(
                {"categoryId": "Provide categoryId, quantity, or both -- at least one is required."}
            )
        return attrs

    def to_service_kwargs(self):
        return {
            "item_id": self.validated_data["itemId"],
            "category_id": self.validated_data.get("categoryId"),
            "quantity": self.validated_data.get("quantity"),
        }


class BookingItemAddSerializer(serializers.Serializer):
    """`BookingItemAddRequest` -- Cashier only (walk-up addendum to the
    ID-verification correction flow). Adds a brand-new line for a
    category that isn't already on the booking -- see
    `services.add_booking_item`'s own docstring for why this is a
    separate operation from `BookingCategoryCorrectionSerializer`, which
    only ever edits an existing line.

    Both fields are required, unlike the correction serializer above: an
    added item has no existing category/quantity to leave unchanged."""

    categoryId = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)

    def to_service_kwargs(self):
        return {
            "category_id": self.validated_data["categoryId"],
            "quantity": self.validated_data["quantity"],
        }
