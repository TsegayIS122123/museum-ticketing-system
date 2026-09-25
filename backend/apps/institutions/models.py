"""
institutions -- models

Depends on: core, accounts

UAT round 1: a school/institution booking a group visit previously typed
its name and TIN fresh into `apps.bookings.Booking.group_name`/`group_tin`
every time, with no shared record behind either -- two visits from the
same school could (and did) end up with two spellings of the name and,
worse, two different TINs, with nothing to catch the mismatch. This app
is the fix: a small standalone registry of institutions, looked up (and
created, the first time) by TIN when a group booking is made
(`apps.bookings.services.create_booking`'s group path calls
`services.resolve_institution`), so the same institution's name stays
one canonical spelling across every booking it ever makes.

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py, in particular TIN
normalization (`services.normalize_tin`), which this model's own
`tin` field deliberately does NOT enforce at the database level beyond
uniqueness -- format validation belongs to the one function everything
routes through, not duplicated as a model-level `RegexValidator` a
future writer could bypass by constructing the model directly.
"""

import uuid

from django.db import models


class Institution(models.Model):
    """
    A school or other institution that has made at least one group
    booking. Not created ahead of time by anyone -- the first group
    booking naming a TIN not yet on file creates the row
    (`services.resolve_institution`); every booking after that, by the
    same TIN, resolves to the same row instead of creating a duplicate.

    `name` is required (English) and is what `apps.bookings.Booking.
    group_name` snapshots at booking time, same as `apps.catalog.
    Category.name_en`/`price_etb` are snapshotted onto `BookingItem` --
    an institution's name changing here (the booker corrects a typo, or
    the Museum Manager fixes one during reconciliation) never
    retroactively rewrites an already-made booking's own `group_name`.
    `name_am` is optional, unlike `core.BilingualNameMixin`'s always-both
    pair -- Amharic transliterations of institution names are frequently
    unknown or contested at the moment of first booking, and requiring
    one up front would either block the booking or invite a
    low-confidence guess; it can be filled in later once known.

    `tin` is the unique key this registry is actually keyed by
    (`services.resolve_institution` looks up by `tin`, never by `name` --
    two institutions can share a name in principle, but never a TIN).
    Nullable at the database level only because Django requires a nullable
    field to be excludable from a `unique=True` constraint's duplicate-NULL
    checks the normal way; every row `resolve_institution` itself creates
    always has one -- see that function's own docstring for why a group
    booking without a resolvable TIN doesn't reach this model at all.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    name_am = models.TextField(null=True, blank=True)
    # Normalized to exactly 10 digits, leading zeros preserved -- a
    # TextField, not an IntegerField, for exactly that leading-zero
    # reason (Section 8's TIN decision). See services.normalize_tin for
    # the single place that normalization happens.
    tin = models.TextField(unique=True, null=True, blank=True)

    # Nullable: the backfill data migration that created a row per
    # distinct historical `Booking.group_tin` (UAT round 1's rollout of
    # this app) has no real actor to attribute those rows to.
    created_by_user_id = models.ForeignKey(
        "accounts.Account",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "institutions"
        constraints = [
            models.CheckConstraint(
                # Belt-and-braces alongside services.normalize_tin's own
                # validation -- exactly 10 digits, matching Section 8's
                # TIN decision, enforced even against a row written
                # outside that function (Django Admin, a data migration).
                check=models.Q(tin__isnull=True) | models.Q(tin__regex=r"^\d{10}$"),
                name="institution_tin_is_ten_digits",
            ),
        ]

    def __str__(self):
        return self.name
