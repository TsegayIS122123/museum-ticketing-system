"""
settlement -- models

Implements FR modules: FR-SETTLE
Depends on: entrance, refunds

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

Per the IFMIS decision (see docs/ decision summary): this is a *per-cashier*
running balance, never a platform-wide batch. Whoever checked a visitor in
personally enters that transaction into IFMIS under her own name, so the
platform tracks what each cashier individually still owes -- one row per
reconciliation attempt for one cashier, not one row per settlement period
for the whole museum.

See Document 05 (Database Design) for the real fields/tables to implement.
"""

import uuid

from django.db import models

from apps.core.models import TimeStampedModel


class CashierReconciliation(TimeStampedModel):
    """
    Implements FR-SETTLE (Document 02) / Document 05 Sec 3.6 (per-cashier
    variant). One row per reconciliation *attempt* by one Cashier -- a real
    Chapa Transfer moving her outstanding balance out of Chapa's pooled
    merchant balance into the university's fixed bank account.

    Nothing is ever generated from this row for a Visitor -- the IFMIS
    vouchers she has already handed out one-per-visitor
    (`Booking.ifmis_voucher_reference`) remain the only record of what she
    owes. But per the manual process this digitizes (she deposits cash at
    a bank, the bank hands her a paper deposit slip, she takes that slip
    to Finance to reconcile), the Cashier still needs her own proof that
    *this* transfer happened, to carry to Finance -- see
    `transfer_receipt_url`. This row exists so the platform can (a) know
    her current outstanding balance and (b) know, once Chapa confirms the
    transfer, which bookings/refunds that payment covered.

    `amount_etb` is fixed at creation time (the balance as computed under
    a row lock in `initiate_reconciliation`) and never recomputed after
    the fact, even if it later fails -- a failed attempt is simply
    abandoned and its underlying bookings/refunds remain eligible for the
    next attempt.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # The Cashier personally responsible for this money in IFMIS -- same
    # person as the `checked_in_by_user_id` on every Booking this
    # reconciliation ends up covering (see `bookings.Booking.reconciliation`,
    # set only once this row reaches COMPLETED).
    cashier = models.ForeignKey(
        "accounts.Account",
        on_delete=models.PROTECT,
        related_name="reconciliations",
    )

    amount_etb = models.DecimalField(max_digits=12, decimal_places=2)

    # Chapa's own reference for this transfer, once the Transfer API call
    # has been made (services.call_chapa_transfer_api) -- null while the
    # row is still being created, populated immediately after the call
    # succeeds synchronously, used later to match the confirming
    # webhook/poll back to this row.
    chapa_transfer_reference = models.TextField(null=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    initiated_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # The Cashier's own copy of proof-of-transfer, to physically carry to
    # Finance when she reconciles her IFMIS vouchers -- the digital
    # equivalent of the paper deposit slip a bank hands her in the manual
    # process. Populated once, only on the COMPLETED path (ADR-009: never
    # regenerated -- see apps.settlement.tasks.render_and_store_transfer_receipt),
    # mirroring `Booking.receipt_url`.
    transfer_receipt_url = models.TextField(null=True, blank=True)

    # Populated on the FAILED path only (e.g. Chapa's transfer call itself
    # errored, or the webhook/poll later reports failure). Never touched
    # on the COMPLETED path.
    failure_reason = models.TextField(null=True, blank=True)

    class Meta:
        app_label = "settlement"
        db_table = "cashier_reconciliation"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_etb__gt=0),
                name="cashier_reconciliation_amount_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["cashier"], name="cashier_recon_cashier_idx"),
            models.Index(fields=["status"], name="cashier_recon_status_idx"),
        ]

    def __str__(self):
        return f"{self.amount_etb} ETB owed by {self.cashier_id} ({self.status})"