"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

`entrance` never defines its own model (see models.py) -- both response
serializers below build on `apps.bookings.serializers.BookingSerializer`
(Document 04's `Booking` schema) rather than re-declaring the resource,
since it's the same underlying `Booking` row either way.
"""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.bookings.serializers import BookingSerializer

from .services import compute_voucher


class FlagMismatchRequestSerializer(serializers.Serializer):
    """`FlagMismatchRequest` -- Cashier only (UAT round 1). Optional
    free-text `note` for the Museum Manager's benefit (e.g. "booked 3
    Students, only 2 showed") -- no quantity or category is submitted
    here at all; see `services.flag_booking_mismatch`'s own docstring
    for why this is a signal, not a correction."""

    note = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=1000
    )


class VoucherSerializer(serializers.Serializer):
    """The `voucher` object (Phase 6, UAT round 1): every field the
    Cashier needs to key into IFMIS, laid out in the same top-to-bottom
    order as the real printed voucher, computed entirely by
    `services.compute_voucher` -- this serializer only shapes the field
    names/types of what that function already returns, matching it key
    for key (a plain dict, no `source=` remapping needed). Shared,
    unmodified, by both `CheckInResponseSerializer` below (right after
    check-in) and `GET /bookings/{id}/ifmis-voucher/` (re-opening the
    panel later) -- one shape, one place it's computed, so the two
    callers can never drift apart.

    `documentNo`/`refNo` are null until `record_ifmis_voucher` sets them;
    `voucherRecorded` is true only once *both* are set (Section 8's "both
    required together" default) and is what should drive a "voucher
    pending" badge, rather than the frontend checking either field
    individually.
    """

    documentNo = serializers.CharField(allow_null=True)
    date = serializers.CharField(allow_null=True)
    refNo = serializers.CharField(allow_null=True)
    nameOfPublicBody = serializers.CharField()
    receivedFrom = serializers.CharField()
    amountFigures = serializers.CharField()
    amountWords = serializers.CharField()
    purpose = serializers.CharField()
    voucherRecorded = serializers.BooleanField()


class CheckInResponseSerializer(BookingSerializer):
    """`Booking`, extended with the single `voucher` object the Cashier
    needs to key into IFMIS herself at the moment of check-in (per the
    IFMIS decision: the platform never calls IFMIS -- it only gives her
    the exact fields to copy in). Returned only from `POST
    /bookings/{id}/check-in` -- every other endpoint that returns a
    `Booking` keeps using the plain `BookingSerializer`, since this field
    is only meaningful right after a check-in action, not as a
    general-purpose booking field. Before Phase 6, this exposed five
    separate flat fields (`payerName`/`payerTin`/`amountFigures`/
    `amountWords`/`ifmisPurpose`); those are now all inside `voucher`,
    alongside the Document No/Ref No/date/public-body-name fields the
    real sample voucher turned out to need too.

    `voucher` is derived read-only from data `check_in_booking` already
    wrote (or that existed on the booking beforehand) -- nothing here
    changes `check_in_booking`'s own business logic or return value; this
    serializer only shapes its *response* representation.
    """

    voucher = serializers.SerializerMethodField()

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ["voucher"]
        read_only_fields = fields

    @extend_schema_field(VoucherSerializer)
    def get_voucher(self, booking) -> dict:
        return compute_voucher(booking=booking)


class IfmisVoucherUpdateSerializer(serializers.Serializer):
    """`IfmisVoucherUpdateRequest` -- Cashier only. The real Document No
    *and* Ref No she gets back from IFMIS after keying the check-in
    transaction in herself -- both required together (Section 8's
    default, Phase 6, UAT round 1): IFMIS issues them as a pair, not one
    at a time. `services.record_ifmis_voucher` enforces the "same
    cashier, settable once" rule -- this serializer is field-shape
    validation only."""

    documentNo = serializers.CharField(max_length=255)
    refNo = serializers.CharField(max_length=255)
