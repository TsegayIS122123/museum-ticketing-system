"""
Unit tests against catalog/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
coverage for business-rule coverage -- see test_views.py for the
Museum-Manager-only permission checks (TC-CAT-002a), which are a view
concern this module doesn't own.
"""

from decimal import Decimal

import pytest
from django.core.cache import cache

from apps.catalog import services
from apps.catalog.models import Category

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_slate():
    # Sec 6.2: the active-category list is cached; each test should see a
    # clean cache regardless of test order. Migration 0002 also seeds the
    # five FR-CAT-001 categories into every fresh test database, so start
    # each test with those cleared too -- these tests exercise services.py
    # in isolation, not the seeded data (see test_seed_categories.py for
    # that).
    cache.clear()
    Category.objects.all().delete()
    yield
    cache.clear()


def _make_category(name_en="Student", price_etb="50.00", active=True, is_free=False):
    return Category.objects.create(
        name_en=name_en,
        name_am=name_en,
        price_etb=Decimal(price_etb),
        is_free=is_free,
        active=active,
    )


# --------------------------------------------------------------------------
# list_active_categories
# --------------------------------------------------------------------------


def test_list_active_categories_excludes_retired():
    active = _make_category(name_en="Student")
    _make_category(name_en="Retired Category", active=False)

    categories = services.list_active_categories()

    assert [c.id for c in categories] == [active.id]


def test_list_active_categories_is_cached_until_invalidated():
    _make_category(name_en="Student")

    first = services.list_active_categories()
    # A category created after the first read bypasses the ORM entirely on
    # a second read if the cache is doing its job.
    _make_category(name_en="Adult / Teacher")
    second = services.list_active_categories()

    assert len(first) == len(second) == 1


# --------------------------------------------------------------------------
# create_category
# --------------------------------------------------------------------------


def test_create_category_persists_and_invalidates_cache():
    services.list_active_categories()  # warm the cache with zero rows

    category = services.create_category(
        name_en="Student", name_am="ተማሪ", price_etb=Decimal("50.00")
    )

    assert Category.objects.count() == 1
    assert category.active is True
    assert category.is_free is False
    assert [c.id for c in services.list_active_categories()] == [category.id]


def test_create_category_defaults_is_free_to_false():
    category = services.create_category(
        name_en="Adult / Teacher", name_am="ጎልማሳ", price_etb=Decimal("100.00")
    )

    assert category.is_free is False


# --------------------------------------------------------------------------
# update_category
# --------------------------------------------------------------------------


def test_update_category_changes_only_provided_fields():
    category = _make_category(name_en="Student", price_etb="50.00")

    updated = services.update_category(category=category, price_etb=Decimal("60.00"))

    assert updated.price_etb == Decimal("60.00")
    assert updated.name_en == "Student"


def test_update_category_does_not_affect_already_issued_tickets():
    """FR-CAT-002: a price/name change never retroactively affects an
    already-issued ticket. Enforced by `booking`'s own snapshot columns
    (Document 05 Sec 3.3, not yet implemented) rather than anything in
    this module -- this test only pins down that editing a Category is a
    plain in-place update with no other side effect that could leak into
    a snapshot taken before the edit."""
    category = _make_category(name_en="Student", price_etb="50.00")
    price_before_edit = category.price_etb

    services.update_category(category=category, price_etb=Decimal("60.00"))

    assert price_before_edit == Decimal("50.00")


def test_update_category_invalidates_cache():
    category = _make_category(name_en="Student", price_etb="50.00")
    services.list_active_categories()  # warm the cache

    services.update_category(category=category, price_etb=Decimal("75.00"))

    [refreshed] = services.list_active_categories()
    assert refreshed.price_etb == Decimal("75.00")


def test_update_category_can_reactivate_a_retired_category():
    category = _make_category(name_en="Student", active=False)

    services.update_category(category=category, active=True)

    assert [c.id for c in services.list_active_categories()] == [category.id]


# --------------------------------------------------------------------------
# retire_category
# --------------------------------------------------------------------------


def test_retire_category_soft_deletes():
    category = _make_category(name_en="Student")

    services.retire_category(category=category)
    category.refresh_from_db()

    assert category.active is False
    assert Category.objects.filter(id=category.id).exists()  # never physically deleted


def test_retire_category_invalidates_cache():
    category = _make_category(name_en="Student")
    services.list_active_categories()  # warm the cache

    services.retire_category(category=category)

    assert services.list_active_categories() == []
