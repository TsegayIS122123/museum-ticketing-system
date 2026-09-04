"""
bookings -- models

Implements FR modules: FR-BOOK
Depends on: catalog, accounts

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per Design Spec Sec 6.4: any staff-editable text (names, templates, notices)
is stored as a parallel English/Amharic column pair, not a single column
with runtime translation -- see Document 05 for the exact fields/tables.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

See Document 05 (Database Design) for the real fields/tables to implement.

Note on `DateAvailability` placement: Document 05 Sec 3.7 lists this table
under `core`, and `apps.catalog.models`'s own docstring says as much --
but it's implemented here instead, not in `core`. `core` has *no*
dependencies (Design Spec Sec 3.2's "core: none" row), while this table's
`closed_by_user_id` is an FK to `accounts.Account`; putting it in `core`
would make the shared kernel depend on `accounts`, inverting the
dependency graph every other app relies on. `bookings` already depends on
`accounts` (Sec 3.2), and owns FR-BOOK-008 per that same mapping table, so
it's the one clean home for both the table and the logic that reads it.
"""

import secrets
import uuid

from django.db import models

from apps.core.models import TimeStampedModel

# Doc05 Sec 3.3: the single value looked up at the gate, whether typed or
# emitted by a keyboard-wedge QR scanner (ADR-007). Alphabet excludes
# visually ambiguous characters (0/O, 1/I) since it's also read aloud/typed
# by hand at the counter.
_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_REFERENCE_LENGTH = 8


def _generate_reference() -> str:
    return "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(_REFERENCE_LENGTH))


class DateAvailability(TimeStampedModel):
    """
    Implements FR-BOOK-008 (Document 02 Sec 2.3) / Document 05 Sec 3.7.

    A row only exists for a date the Museum Manager has explicitly acted
    on; a date with no row is open by default (services.py resolves this,
    never the caller). "The system does not calculate or track overall
    museum capacity itself" (FR-BOOK-008) -- this flag is entirely the
    Museum Manager's call, never derived from booking counts.
    """

    # Doc05 Sec 3.7's deliberate exception to the UUID-PK convention
    # (Sec 1.3) -- this table is inherently one row per calendar date.
    visit_date = models.DateField(primary_key=True)

    is_open_for_booking = models.BooleanField(default=True)

    closed_by_user_id = models.ForeignKey(
        "accounts.Account",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="The Museum Manager who last changed this date's state -- set on every "
        "change, open or close, not only on close.",
    )
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "bookings"
        db_table = "date_availability"
        ordering = ["visit_date"]

    def __str__(self):
        return f"{self.visit_date} ({'open' if self.is_open_for_booking else 'closed'})"


class Booking(TimeStampedModel):
    """
    Implements FR-BOOK-001 - FR-BOOK-008 and the lifecycle mechanics of
    FR-PAY-002/003/005 (Document 02 Sec 2.3-2.4) / Document 05 Sec 3.3.
    This is the central table of the schema -- nearly every other app
    (payments, entrance, refunds, settlement, reporting) hangs off it.

    Fields owned operationally by a future app (`checked_in_*`,
    `chapa_checkout_url`, `receipt_url`, `ifmis_voucher_reference`,
    `reconciliation`) are declared here because this is the authoritative
    table per Document 05 -- they are simply never *written* by this
    app's services.py, only read.
    """

    class BookingType(models.TextChoices):
        INDIVIDUAL = "individual", "Individual"
        GROUP = "group", "Group"

    class Status(models.TextChoices):
        AWAITING_PAYMENT = "awaiting_payment", "Awaiting payment"
        PENDING = "pending", "Pending"
        VISITED = "visited", "Visited"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    reference = models.TextField(unique=True, default=_generate_reference)

    visitor = models.ForeignKey(
        "accounts.Account",
        on_delete=models.PROTECT,
        related_name="bookings",
        db_column="visitor_id",
    )
    category = models.ForeignKey(
        "catalog.Category",
        on_delete=models.PROTECT,
        related_name="bookings",
        db_column="category_id",
    )

    # Snapshot of the category's bilingual name/price at booking time
    # (Sec 3.3) -- a later Museum Manager price edit (FR-CAT-002) never
    # touches an already-issued booking. Declared as its own fields per
    # `core.BilingualNameMixin`'s own docstring: a differently-named
    # bilingual pair declares its own fields rather than using the mixin.
    category_name_en = models.TextField()
    category_name_am = models.TextField()
    unit_price_etb = models.DecimalField(max_digits=12, decimal_places=2)

    visit_date = models.DateField()

    booking_type = models.CharField(max_length=10, choices=BookingType.choices)
    group_name = models.TextField(null=True, blank=True)
    group_contact_phone = models.TextField(null=True, blank=True)

    booked_quantity = models.PositiveIntegerField()
    attended_quantity = models.PositiveIntegerField(null=True, blank=True)

    total_amount_etb = models.DecimalField(max_digits=12, decimal_places=2)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.AWAITING_PAYMENT
    )

    rescheduled_count = models.PositiveSmallIntegerField(default=0)
    notice_sent_at = models.DateTimeField(null=True, blank=True)

    # Populated by apps.entrance (FR-TICKET-001) -- declared here since
    # this is the authoritative table, never written by this app.
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by_user_id = models.ForeignKey(
        "accounts.Account",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # Populated by apps.payments once it exists (Sec 4.2's sequence) --
    # null here until that app creates a Chapa checkout session.
    chapa_checkout_url = models.TextField(null=True, blank=True)
    # Populated once, at payment confirmation, by apps.payments (ADR-009).
    receipt_url = models.TextField(null=True, blank=True)

    # The real Document No/Ref No the Cashier gets back from IFMIS at
    # check-in. Not known at the instant `check_in_booking` runs -- she
    # keys the transaction into IFMIS separately and reports it back via
    # `PATCH /bookings/{id}/ifmis-voucher/` (apps.entrance, Step 7).
    ifmis_voucher_reference = models.TextField(null=True, blank=True)

    # Set once this booking's amount has been included in a *completed*
    # per-cashier reconciliation (apps.settlement.CashierReconciliation).
    # PROTECT: a reconciliation that has bookings attributed to it must
    # never be deleted out from under them.
    reconciliation = models.ForeignKey(
        "settlement.CashierReconciliation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="bookings",
    )

    class Meta:
        app_label = "bookings"
        db_table = "booking"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(booked_quantity__gte=1),
                name="booking_quantity_at_least_one",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(attended_quantity__isnull=True)
                    | (
                        models.Q(attended_quantity__gte=0)
                        & models.Q(attended_quantity__lte=models.F("booked_quantity"))
                    )
                ),
                name="booking_attended_within_booked",
            ),
            models.CheckConstraint(
                # FR-BOOK-003: a group booking must name a school/group.
                condition=(
                    models.Q(booking_type="individual")
                    | models.Q(group_name__isnull=False)
                ),
                name="booking_group_requires_group_name",
            ),
            models.CheckConstraint(
                # FR-BOOK-007's "at most once" cap, enforced as a database
                # invariant, not only a services.py check.
                condition=models.Q(rescheduled_count__lte=1),
                name="booking_rescheduled_at_most_once",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "visit_date"], name="booking_status_visit_date_idx"),
            models.Index(
                fields=["checked_in_by_user_id"],
                name="booking_visited_unrecon_idx",
                condition=models.Q(status="visited", reconciliation__isnull=True),
            ),
            models.Index(
                fields=["notice_sent_at"],
                name="booking_pending_notice_idx",
                condition=models.Q(status="pending", notice_sent_at__isnull=False),
            ),
        ]

    def __str__(self):
        return self.reference