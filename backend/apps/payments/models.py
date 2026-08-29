"""
payments -- models

Implements FR modules: FR-PAY-001 - FR-PAY-004, NFR-SEC-001, NFR-IDEMPOTENT-001
Depends on: bookings

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

See Document 05 Sec 3.4 for the authoritative field list.
"""

import uuid

from django.db import models

from apps.core.models import TimeStampedModel


class Payment(TimeStampedModel):
    """
    Implements FR-PAY-001 - FR-PAY-004 / Document 05 Sec 3.4. One row per
    Chapa checkout attempt against a `bookings.Booking` -- normally one,
    but a booking can accumulate more than one `Payment` if an earlier
    attempt failed and checkout was retried (`booking ||--o{ payment`,
    Document 05 Sec 2's ER diagram).

    `tx_ref` is Chapa's own transaction reference, generated here at
    checkout-session creation and echoed back on the webhook -- its
    `UNIQUE` constraint is what makes a duplicated/retried webhook call a
    constraint violation the service layer can safely no-op on, rather
    than a race condition it has to detect itself (NFR-IDEMPOTENT-001).
    """

    class Gateway(models.TextChoices):
        # A closed vocabulary of one today (Document 05 Sec 3.4) -- kept
        # as a CHECK/choices field, not a free-text column, so adding a
        # second aggregator later is a migration, not a rewrite.
        CHAPA = "chapa", "Chapa"

    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.PROTECT,
        related_name="payments",
        db_column="booking_id",
    )

    tx_ref = models.TextField(unique=True)
    gateway = models.CharField(max_length=10, choices=Gateway.choices, default=Gateway.CHAPA)

    amount_etb = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=8, default="ETB")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.INITIATED)

    # Present once the checkout session is created; mirrored onto
    # `booking.chapa_checkout_url` (bookings/models.py) for the API
    # contract's convenience, but this column is the durable record.
    checkout_url = models.TextField(null=True, blank=True)

    # Raw webhook body retained for reconciliation without needing to
    # re-query Chapa after the fact (Document 05 Sec 3.4).
    webhook_payload = models.JSONField(null=True, blank=True)
    webhook_received_at = models.DateTimeField(null=True, blank=True)

    # Set only after signature verification succeeds (NFR-SEC-001) -- this,
    # not `webhook_received_at`, is what "payment verified as successfully
    # completed" (FR-PAY-002) means, and what actually moves the booking
    # to `Pending`.
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "payments"
        db_table = "payment"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_etb__gt=0),
                name="payment_amount_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["booking"], name="payment_booking_idx"),
            models.Index(fields=["status"], name="payment_status_idx"),
        ]

    def __str__(self):
        return self.tx_ref
