"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

`entrance` never defines its own model (see models.py) -- both response
serializers below build on `apps.bookings.serializers.BookingSerializer`
(Document 04's `Booking` schema) rather than re-declaring the resource,
since it's the same underlying `Booking` row either way.
"""

from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.bookings.serializers import BookingSerializer

from .services import amount_in_words_etb, compute_attended_amount_etb


class CheckInItemSerializer(serializers.Serializer):
    """One `{itemId, attendedQuantity}` entry of a `CheckInRequest`'s
    `items` list -- one per `BookingItem`/category on the booking being
    checked in. `attendedQuantity` may be 0 (nobody in that category
    showed up) but never negative; the upper bound (must not exceed that
    item's own booked `quantity`, FR-TICKET-005) and "every item must be
    covered exactly once" are cross-field business rules against the
    booking being checked in, not field-level constraints this serializer
    can express on its own -- both checks live in services.
    check_in_booking."""

    itemId = serializers.UUIDField()
    attendedQuantity = serializers.IntegerField(min_value=0)


class CheckInRequestSerializer(serializers.Serializer):
    """`CheckInRequest` (Document 04) -- FR-TICKET-001. Per-category, not
    a single combined headcount: a booking can mix categories
    (`BookingItem`), and recording only one blended total throws away
    exactly the information `apps.refunds.services.
    compute_refundable_amount` needs to refund a later no-show at that
    category's own price rather than a blended average across every
    category on the booking (FR-REFUND-002)."""

    items = CheckInItemSerializer(many=True, allow_empty=False)


class CheckInResponseSerializer(BookingSerializer):
    """`Booking`, extended with the IFMIS voucher-prep fields the Cashier
    needs to key into IFMIS herself at the moment of check-in (per the
    IFMIS decision: the platform never calls IFMIS -- it only gives her
    the exact fields to copy in). Returned only from `POST
    /bookings/{id}/check-in` -- every other endpoint that returns a
    `Booking` keeps using the plain `BookingSerializer`, since these
    fields are only meaningful right after a check-in action, not as a
    general-purpose booking field.

    All four are derived read-only from data `check_in_booking` already
    wrote (or that existed on the booking beforehand) -- nothing here
    changes `check_in_booking`'s own business logic or return value; this
    serializer only shapes its *response* representation.
    """

    payerName = serializers.SerializerMethodField()
    # The institutional payer's TIN, for the same "Received From: <name>,
    # Tin <tin>" line on the IFMIS receipt voucher that `payerName` feeds
    # -- present only for a group booking (`booking_group_requires_group_
    # tin` guarantees it's set whenever `payerName` resolves to a group
    # name), null for an individual one, same shape as `payerName` itself.
    payerTin = serializers.SerializerMethodField()
    # NOT `total_amount_etb` (the full booked amount) -- a partial
    # no-show means part of that money is refund-eligible, not museum
    # revenue, so both figures below reflect only what was actually
    # attended. See `compute_attended_amount_etb`'s docstring.
    amountFigures = serializers.SerializerMethodField()
    amountWords = serializers.SerializerMethodField()
    ifmisPurpose = serializers.SerializerMethodField()

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + [
            "payerName",
            "payerTin",
            "amountFigures",
            "amountWords",
            "ifmisPurpose",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField)
    def get_payerName(self, booking) -> str:
        """The name the Cashier writes on the IFMIS voucher: the group's
        name for a group booking (FR-BOOK-003's `group_name`, always
        present there per `booking_group_requires_group_name`), otherwise
        the individual Visitor's own name."""
        if booking.booking_type == booking.BookingType.GROUP:
            return booking.group_name
        return booking.visitor.full_name

    @extend_schema_field(serializers.CharField)
    def get_payerTin(self, booking) -> str | None:
        """The institutional payer's TIN, alongside `payerName` above, on
        a group booking's IFMIS voucher (e.g. "Received From: BS School
        Group, Tin 0000900158"). `None` for an individual booking -- an
        individual Visitor isn't issued a TIN by this system."""
        if booking.booking_type == booking.BookingType.GROUP:
            return booking.group_tin
        return None

    @extend_schema_field(serializers.DecimalField(max_digits=12, decimal_places=2))
    def get_amountFigures(self, booking) -> Decimal:
        return compute_attended_amount_etb(booking=booking)

    @extend_schema_field(serializers.CharField)
    def get_amountWords(self, booking) -> str:
        return amount_in_words_etb(compute_attended_amount_etb(booking=booking))

    @extend_schema_field(serializers.CharField)
    def get_ifmisPurpose(self, booking) -> str:
        return (
            f"Museum entry — booking {booking.reference}, "
            f"{booking.attended_quantity} visitor(s)"
        )


class IfmisVoucherUpdateSerializer(serializers.Serializer):
    """`IfmisVoucherUpdateRequest` -- Cashier only. The real Document
    No/Ref No she gets back from IFMIS after keying the check-in
    transaction in herself (services.record_ifmis_voucher_reference
    enforces the "same cashier, settable once" rule -- this serializer is
    field-shape validation only)."""

    voucherReference = serializers.CharField(max_length=255)
