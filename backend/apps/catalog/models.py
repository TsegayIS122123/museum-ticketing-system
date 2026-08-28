"""
catalog -- models

Implements FR modules: FR-CAT
Depends on: core

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per Design Spec Sec 6.4: `name_en`/`name_am` (via core.BilingualNameMixin) is
the parallel English/Amharic column pair for this staff-editable name --
maintained independently, never derived from the other (FR-LOC-004).

Per ADR-004: this project has no multi-tenancy layer (single venue) -- do
NOT reach for a tenant-scoped manager pattern here.

Note: `date_availability` (FR-BOOK-008) is NOT part of this app despite the
README build-order table's shorthand -- Document 05 Sec 3.7 places that
table under `core`, and Document 03 Sec 3.2 maps FR-BOOK-008 to `bookings`.
It's implemented alongside `apps.bookings`, not here.

See Document 05 Sec 3.2 for the authoritative column list.
"""

import uuid

from django.db import models

from apps.core.models import BilingualNameMixin, TimeStampedModel


class Category(BilingualNameMixin, TimeStampedModel):
    """
    Implements FR-CAT-001 - FR-CAT-003 (Document 02 Sec 2.2) / Document 05
    Sec 3.2.

    A `booking` row (once that app exists) snapshots `name_en`/`name_am`/
    `price_etb` onto itself at creation time -- so editing or retiring a
    Category here never retroactively changes an already-issued ticket
    (FR-CAT-002), without this model needing to know anything about that.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Seeded from current policy (FR-CAT-001): Student 50, Adult/Teacher
    # 100, Foreign Resident 300, Non-Resident 500, Exempt/Free 0 -- see
    # migration 0002_seed_categories.
    price_etb = models.DecimalField(max_digits=12, decimal_places=2)

    # Distinguishes an intentionally free category (e.g. AAU staff, on
    # presentation of ID) from a data-entry zero.
    is_free = models.BooleanField(default=False)

    # "Retiring" a category (DELETE /categories/{id}, FR-CAT-002) sets this
    # False; it is never deleted -- a `booking` FK (Document 05 Sec 3.3)
    # references this row's id with ON DELETE RESTRICT even after
    # retirement, and displays via its own snapshot columns, not a live
    # join to this row.
    active = models.BooleanField(default=True)

    class Meta:
        app_label = "catalog"
        db_table = "category"
        ordering = ["name_en"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price_etb__gte=0),
                name="category_price_non_negative",
            ),
        ]
        indexes = [
            # The public GET /categories endpoint only ever lists active
            # categories (Document 05 Sec 3.2).
            models.Index(fields=["active"], name="category_active_idx"),
        ]

    def __str__(self):
        return self.name_en
