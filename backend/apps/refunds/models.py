"""
refunds -- models

Implements FR modules: FR-REFUND
Depends on: payments, entrance

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

See Document 05 Sec 3.5 for the authoritative field list.
"""

import uuid

from django.db import models

from apps.core.models import TimeStampedModel


class Refund(TimeStampedModel):
    """
    Implements FR-REFUND-001 - FR-REFUND-005 and NFR-AUDIT-001 (Document 05
    Sec 3.5). One row per refund *transaction* (FR-REFUND-004) -- never
    updated in place to represent a second refund attempt against the
    same shortfall; `services.py`'s per-booking uniqueness guard is what
    keeps this true in practice.

    `amount_etb` is always the NET figure actually returned to the
    Visitor -- gross refundable amount (FR-REFUND-002) minus
    `aggregator_fee_etb` (FR-REFUND-003). The gross amount itself is never
    stored: it's reconstructable as `amount_etb + aggregator_fee_etb`
    whenever it's needed (e.g. an audit-log entry), per FR-REFUND-004.
    """

    class Reason(models.TextChoices):
        # Mirrors FR-REFUND-001(a)/(b)/(c) directly -- one value per
        # trigger, never a free-text column.
        CANCELLATION = "cancellation", "Cancellation"
        PARTIAL_SHORTFALL = "partial_shortfall", "Partial shortfall"
        NO_RESPONSE = "no_response", "No response"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.PROTECT,
        related_name="refunds",
        db_column="booking_id",
    )
    # The original charge being reversed -- needed so a booking's net
    # amount (charge - fee - refund) is reconstructable per booking, per
    # FR-REFUND-004 (Document 05 Sec 3.5).
    payment = models.ForeignKey(
        "payments.Payment",
        on_delete=models.PROTECT,
        related_name="refunds",
        db_column="payment_id",
    )

    amount_etb = models.DecimalField(max_digits=12, decimal_places=2)
    aggregator_fee_etb = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    reason = models.CharField(max_length=20, choices=Reason.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    # Nullable -- the two automatic paths (cancellation, no-response) have
    # no requester; only partial_shortfall (FR-REFUND-001b) is
    # Visitor-initiated.
    requested_by_user_id = models.ForeignKey(
        "accounts.Account",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    note = models.TextField(null=True, blank=True)

    # External reference once Chapa confirms the refund (ADR-008) -- this
    # is Chapa's `data.ref_id` from the initiate-refund response, the same
    # value later passed to Chapa's own verify-refund endpoint.
    chapa_refund_reference = models.TextField(null=True, blank=True)

    # FK to `settlement.SettlementTransfer` per Doc05 Sec 3.5 -- that app
    # doesn't have a model yet (Sec 3.2's dependency order: settlement
    # depends on refunds, not the reverse), so this is a plain UUID for
    # now rather than a FK to a model that isn't there, mirroring
    # `bookings.Booking.settlement_transfer_id`'s own justification. Set
    # only by `apps.settlement`, once it exists, at the moment a *future*
    # transfer nets this refund off (FR-REFUND-005) -- never written by
    # this app's own services.py.
    deducted_in_transfer_id = models.UUIDField(null=True, blank=True)

    class Meta:
        app_label = "refunds"
        db_table = "refund"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_etb__gt=0),
                name="refund_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(aggregator_fee_etb__gte=0),
                name="refund_aggregator_fee_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["booking"], name="refund_booking_idx"),
            models.Index(fields=["status"], name="refund_status_idx"),
            # Exactly the set a new settlement transfer must net off
            # (Document 03 Sec 5.3) -- completed refunds not yet
            # accounted for in any transfer.
            models.Index(
                fields=["id"],
                name="refund_undeducted_idx",
                condition=models.Q(deducted_in_transfer_id__isnull=True, status="completed"),
            ),
        ]

    def __str__(self):
        return f"{self.reason} refund of {self.amount_etb} ETB for {self.booking_id}"
