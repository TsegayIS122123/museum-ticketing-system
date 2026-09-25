"""
Unit tests against institutions/services.py directly (Design Spec Sec
3.1), per the coverage target in NFR-MAINT-001.
"""

import pytest
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.core.models import AuditLogEntry
from apps.institutions import services
from apps.institutions.models import Institution

pytestmark = pytest.mark.django_db


def _make_visitor(email="visitor@example.com"):
    account = Account(email=email, full_name="Test Visitor", role=Account.Role.VISITOR)
    account.set_password("a-strong-password-1")
    account.save()
    return account


# --------------------------------------------------------------------------
# normalize_tin
# --------------------------------------------------------------------------


def test_normalize_tin_accepts_ten_digits():
    assert services.normalize_tin("0000900158") == "0000900158"


def test_normalize_tin_strips_hyphens_and_spaces():
    assert services.normalize_tin("0000-900158") == "0000900158"
    assert services.normalize_tin("0000 900158") == "0000900158"
    assert services.normalize_tin(" 0000 9001 58 ") == "0000900158"


def test_normalize_tin_preserves_leading_zeros():
    normalized = services.normalize_tin("0000900158")
    assert normalized.startswith("0000")
    assert len(normalized) == 10


def test_normalize_tin_rejects_wrong_length():
    with pytest.raises(ValidationError):
        services.normalize_tin("123")
    with pytest.raises(ValidationError):
        services.normalize_tin("00009001580000")


def test_normalize_tin_rejects_non_digits():
    with pytest.raises(ValidationError):
        services.normalize_tin("00009abc58")


def test_normalize_tin_rejects_none():
    with pytest.raises(ValidationError):
        services.normalize_tin(None)


# --------------------------------------------------------------------------
# find_institution_by_tin
# --------------------------------------------------------------------------


def test_find_institution_by_tin_returns_none_when_unrecognized():
    assert services.find_institution_by_tin(tin="0000900158") is None


def test_find_institution_by_tin_finds_existing():
    Institution.objects.create(name="Example Primary School", tin="0000900158")

    found = services.find_institution_by_tin(tin="0000900158")

    assert found is not None
    assert found.name == "Example Primary School"


def test_find_institution_by_tin_normalizes_before_lookup():
    Institution.objects.create(name="Example Primary School", tin="0000900158")

    found = services.find_institution_by_tin(tin="0000-900158")

    assert found is not None


# --------------------------------------------------------------------------
# resolve_institution
# --------------------------------------------------------------------------


def test_resolve_institution_creates_new_institution():
    visitor = _make_visitor()

    institution = services.resolve_institution(
        name="Example Primary School", tin="0000900158", actor=visitor
    )

    assert institution.name == "Example Primary School"
    assert institution.tin == "0000900158"
    assert institution.created_by_user_id_id == visitor.id


def test_resolve_institution_reuses_existing_row_for_same_tin():
    first = services.resolve_institution(name="Example Primary School", tin="0000900158")
    second = services.resolve_institution(name="Example Primary School", tin="0000900158")

    assert first.id == second.id
    assert Institution.objects.count() == 1


def test_resolve_institution_updates_name_on_mismatch_and_logs_it():
    """Section 8's decision #3 default: the freshly-typed name wins, and
    the change is audit-logged, not silent."""
    services.resolve_institution(name="Example Primary School", tin="0000900158")

    updated = services.resolve_institution(name="Example Primary School (New Campus)", tin="0000900158")

    assert updated.name == "Example Primary School (New Campus)"
    assert Institution.objects.count() == 1
    entry = AuditLogEntry.objects.get(action="institution.name_corrected")
    assert entry.metadata["old_name"] == "Example Primary School"
    assert entry.metadata["new_name"] == "Example Primary School (New Campus)"


def test_resolve_institution_does_not_overwrite_existing_name_am():
    services.resolve_institution(
        name="Example Primary School", tin="0000900158", name_am="የምሳሌ የመጀመሪያ ደረጃ ትምህርት ቤት"
    )

    updated = services.resolve_institution(
        name="Example Primary School", tin="0000900158", name_am=None
    )

    assert updated.name_am == "የምሳሌ የመጀመሪያ ደረጃ ትምህርት ቤት"


def test_resolve_institution_fills_in_missing_name_am():
    services.resolve_institution(name="Example Primary School", tin="0000900158")

    updated = services.resolve_institution(
        name="Example Primary School", tin="0000900158", name_am="የምሳሌ የመጀመሪያ ደረጃ ትምህርት ቤት"
    )

    assert updated.name_am == "የምሳሌ የመጀመሪያ ደረጃ ትምህርት ቤት"


def test_resolve_institution_rejects_malformed_tin():
    with pytest.raises(ValidationError):
        services.resolve_institution(name="Example Primary School", tin="123")


def test_resolve_institution_normalizes_tin_with_separators():
    institution = services.resolve_institution(
        name="Example Primary School", tin="0000-900158"
    )

    assert institution.tin == "0000900158"


# --------------------------------------------------------------------------
# Institution.institution_tin_is_ten_digits (DB-level belt-and-braces,
# alongside normalize_tin's own validation)
# --------------------------------------------------------------------------


def test_institution_model_rejects_malformed_tin_at_db_level():
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Institution.objects.create(name="Bad TIN School", tin="123")


def test_institution_model_allows_null_tin_at_db_level():
    # Nullable purely for the unique-constraint mechanics (this model's
    # own docstring) -- every row `resolve_institution` creates always
    # has one, but the DB itself doesn't forbid a null.
    institution = Institution.objects.create(name="No TIN Yet")
    assert institution.tin is None
