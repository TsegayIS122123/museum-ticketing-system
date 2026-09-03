"""
Verifies the data migration that seeds FR-CAT-001's five current-policy
categories (Document 07 TC-CAT-001a). A dedicated test, separate from
test_services.py/test_views.py, since those two deliberately clear the
table first to test services.py/views.py in isolation from seed data.
"""

from decimal import Decimal

import pytest

from apps.catalog.models import Category

pytestmark = pytest.mark.django_db


def test_seed_categories_match_current_policy():
    expected = {
        "Student": Decimal("50.00"),
        "Adult": Decimal("100.00"),
        "Foreign Resident": Decimal("300.00"),
        "Non-Resident": Decimal("500.00"),
    }

    seeded = {c.name_en: c.price_etb for c in Category.objects.all()}

    assert seeded == expected


def test_seed_categories_are_active_and_none_are_free():
    for category in Category.objects.all():
        assert category.active is True
        assert category.is_free is False
