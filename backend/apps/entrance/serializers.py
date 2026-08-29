"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

`entrance` never defines its own model (see models.py), so there is no
`BookingSerializer` here -- the response shape for both endpoints below
*is* `apps.bookings.serializers.BookingSerializer` (Document 04's
`Booking` schema), reused as-is rather than re-declared, since it's the
same resource either way.
"""

from rest_framework import serializers


class CheckInRequestSerializer(serializers.Serializer):
    """`CheckInRequest` (Document 04) -- FR-TICKET-001. `attendedQuantity`
    may be 0 (nobody in the party showed up) but never negative; the
    upper bound (must not exceed bookedQuantity, FR-TICKET-005) is a
    cross-field business rule against the booking being checked in, not a
    field-level constraint this serializer can express on its own -- that
    check lives in services.check_in_booking."""

    attendedQuantity = serializers.IntegerField(min_value=0)
