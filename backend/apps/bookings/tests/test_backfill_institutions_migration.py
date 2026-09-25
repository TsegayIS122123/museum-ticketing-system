"""
Exercises `apps.bookings.migrations.0011_backfill_institutions`'s
`backfill_institutions` function directly against the real (not
historical-state) model registry -- pragmatic given this project has no
migration-testing package installed, and `apps.get_model(app_label,
name)` behaves identically whether `apps` is Django's live app registry
or a migration's historical one, for what this function actually calls.
This is a plain unit test of that function's logic, not a true
apply/rollback migration test.
"""

import importlib

import pytest
from django.apps import apps as django_apps
from django.utils import timezone

from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem
from apps.catalog.models import Category
from apps.core.models import AuditLogEntry
from apps.institutions.models import Institution

pytestmark = pytest.mark.django_db

_migration = importlib.import_module(
    "apps.bookings.migrations.0011_backfill_institutions"
)


def _make_visitor(email="visitor@example.com"):
    account = Account(email=email, full_name="Visitor Person", role=Account.Role.VISITOR)
    account.set_unusable_password()
    account.save()
    return account


def _make_group_booking(*, visitor, group_name, group_tin, created_at):
    category = Category.objects.create(name_en="Student", name_am="Student", price_etb="50.00")
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=timezone.localdate(),
        booking_type=Booking.BookingType.GROUP,
        group_name=group_name,
        group_tin=group_tin,
        booked_quantity=10,
        total_amount_etb="500.00",
        status=Booking.Status.AWAITING_PAYMENT,
    )
    BookingItem.objects.create(
        booking=booking,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        quantity=10,
        subtotal_etb="500.00",
    )
    Booking.objects.filter(id=booking.id).update(created_at=created_at)
    return Booking.objects.get(id=booking.id)


def test_backfill_creates_one_institution_per_distinct_normalized_tin():
    visitor = _make_visitor()
    now = timezone.now()
    _make_group_booking(
        visitor=visitor, group_name="School A", group_tin="0000900158", created_at=now
    )
    _make_group_booking(
        visitor=visitor, group_name="School B", group_tin="0012345678", created_at=now
    )

    _migration.backfill_institutions(django_apps, None)

    assert Institution.objects.count() == 2
    assert set(Institution.objects.values_list("tin", flat=True)) == {
        "0000900158",
        "0012345678",
    }


def test_backfill_links_bookings_to_the_shared_institution():
    visitor = _make_visitor()
    now = timezone.now()
    first = _make_group_booking(
        visitor=visitor, group_name="School A", group_tin="0000900158", created_at=now
    )
    second = _make_group_booking(
        visitor=visitor, group_name="School A", group_tin="0000900158", created_at=now
    )

    _migration.backfill_institutions(django_apps, None)

    first.refresh_from_db()
    second.refresh_from_db()
    assert first.institution_id == second.institution_id
    assert first.institution_id is not None


def test_backfill_names_institution_after_most_recent_booking():
    from datetime import timedelta

    visitor = _make_visitor()
    earlier = timezone.now() - timedelta(days=5)
    later = timezone.now()
    _make_group_booking(
        visitor=visitor, group_name="School (old spelling)", group_tin="0000900158", created_at=earlier
    )
    _make_group_booking(
        visitor=visitor, group_name="School (corrected spelling)", group_tin="0000900158", created_at=later
    )

    _migration.backfill_institutions(django_apps, None)

    institution = Institution.objects.get(tin="0000900158")
    assert institution.name == "School (corrected spelling)"


def test_backfill_skips_a_malformed_historical_tin():
    visitor = _make_visitor()
    now = timezone.now()
    booking = _make_group_booking(
        visitor=visitor, group_name="Bad Data School", group_tin="not-a-real-tin", created_at=now
    )

    _migration.backfill_institutions(django_apps, None)

    booking.refresh_from_db()
    assert booking.institution_id is None
    assert Institution.objects.count() == 0


def test_backfill_writes_an_audit_log_entry_per_institution():
    visitor = _make_visitor()
    now = timezone.now()
    _make_group_booking(
        visitor=visitor, group_name="School A", group_tin="0000900158", created_at=now
    )

    _migration.backfill_institutions(django_apps, None)

    entry = AuditLogEntry.objects.get(action="institution.backfilled")
    assert entry.metadata["tin"] == "0000900158"
    assert entry.actor_id is None
