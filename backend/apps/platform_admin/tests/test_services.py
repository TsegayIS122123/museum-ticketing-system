"""
Unit tests against platform_admin/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage -- see test_views.py for the
Platform-Admin-only permission checks, which are a view concern this
module doesn't own.
"""

from unittest import mock

import pytest
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.core.exceptions import Conflict
from apps.core.models import AuditLogEntry
from apps.platform_admin import services

pytestmark = pytest.mark.django_db


def _make_staff(role, email="staff@example.com", password="a-strong-password-1", active=True):
    account = Account(email=email, full_name="Staff Person", role=role, active=active)
    account.set_password(password)
    account.save()
    return account


def _make_admin(email="admin@example.com"):
    return _make_staff(Account.Role.PLATFORM_ADMIN, email=email)


# --------------------------------------------------------------------------
# list_staff
# --------------------------------------------------------------------------


def test_list_staff_includes_every_staff_role_but_not_visitors():
    cashier = _make_staff(Account.Role.CASHIER, email="cashier@example.com")
    manager = _make_staff(Account.Role.MUSEUM_MANAGER, email="manager@example.com")
    admin = _make_admin()
    Account.objects.create_user(email="visitor@example.com", full_name="V")

    staff_ids = {a.id for a in services.list_staff()}

    assert staff_ids == {cashier.id, manager.id, admin.id}


def test_list_staff_orders_most_recently_created_first():
    older = _make_staff(Account.Role.CASHIER, email="older@example.com")
    newer = _make_staff(Account.Role.CASHIER, email="newer@example.com")

    assert list(services.list_staff()) == [newer, older]


# --------------------------------------------------------------------------
# create_staff_account
# --------------------------------------------------------------------------


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_provisions_cashier(mock_reset):
    actor = _make_admin()

    account = services.create_staff_account(
        actor=actor,
        email="Cashier@Example.com",
        full_name="New Cashier",
        role=Account.Role.CASHIER,
        phone="+251911000001",
    )

    account.refresh_from_db()
    assert account.role == Account.Role.CASHIER
    assert account.active is True
    assert not account.has_usable_password()


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_sends_set_password_link(mock_reset):
    actor = _make_admin()

    account = services.create_staff_account(
        actor=actor, email="cashier@example.com", full_name="New Cashier", role=Account.Role.CASHIER
    )

    mock_reset.assert_called_once_with(email=account.email)


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_writes_audit_log(mock_reset):
    actor = _make_admin()

    account = services.create_staff_account(
        actor=actor,
        email="manager@example.com",
        full_name="New Manager",
        role=Account.Role.MUSEUM_MANAGER,
    )

    entry = AuditLogEntry.objects.get(target_type="account", target_id=str(account.id))
    assert entry.actor_id == actor.id
    assert entry.action == "staff.created"
    assert entry.metadata == {"role": Account.Role.MUSEUM_MANAGER}


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_rejects_visitor_role(mock_reset):
    actor = _make_admin()

    with pytest.raises(ValidationError):
        services.create_staff_account(
            actor=actor, email="x@example.com", full_name="X", role=Account.Role.VISITOR
        )


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_rejects_platform_admin_role(mock_reset):
    actor = _make_admin()

    with pytest.raises(ValidationError):
        services.create_staff_account(
            actor=actor, email="x@example.com", full_name="X", role=Account.Role.PLATFORM_ADMIN
        )


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_rejects_duplicate_email(mock_reset):
    actor = _make_admin()
    _make_staff(Account.Role.CASHIER, email="taken@example.com")

    with pytest.raises(Conflict):
        services.create_staff_account(
            actor=actor, email="taken@example.com", full_name="X", role=Account.Role.CASHIER
        )


@mock.patch("apps.accounts.services.request_password_reset")
def test_create_staff_account_rejects_duplicate_phone(mock_reset):
    actor = _make_admin()
    _make_staff(Account.Role.CASHIER, email="a@example.com")
    Account.objects.filter(email="a@example.com").update(phone="+251911000002")

    with pytest.raises(Conflict):
        services.create_staff_account(
            actor=actor,
            email="b@example.com",
            full_name="X",
            role=Account.Role.CASHIER,
            phone="+251911000002",
        )


# --------------------------------------------------------------------------
# update_staff_account
# --------------------------------------------------------------------------


def test_update_staff_account_changes_role():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")

    updated = services.update_staff_account(
        actor=actor, account=account, role=Account.Role.MUSEUM_MANAGER
    )

    assert updated.role == Account.Role.MUSEUM_MANAGER


def test_update_staff_account_deactivating_bumps_token_version():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")
    starting_version = account.token_version

    updated = services.update_staff_account(actor=actor, account=account, active=False)

    assert updated.active is False
    assert updated.token_version == starting_version + 1


def test_update_staff_account_reactivating_does_not_bump_token_version():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com", active=False)
    starting_version = account.token_version

    updated = services.update_staff_account(actor=actor, account=account, active=True)

    assert updated.active is True
    assert updated.token_version == starting_version


def test_update_staff_account_only_touches_provided_fields():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")

    updated = services.update_staff_account(actor=actor, account=account, active=False)

    assert updated.role == Account.Role.CASHIER


def test_update_staff_account_writes_audit_log_only_for_actual_changes():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")

    services.update_staff_account(actor=actor, account=account, role=Account.Role.CASHIER)

    assert not AuditLogEntry.objects.filter(
        target_type="account", target_id=str(account.id)
    ).exists()

    services.update_staff_account(actor=actor, account=account, active=False)

    entry = AuditLogEntry.objects.get(target_type="account", target_id=str(account.id))
    assert entry.action == "staff.updated"
    assert entry.metadata == {"active": False}


def test_update_staff_account_rejects_visitor_role():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")

    with pytest.raises(ValidationError):
        services.update_staff_account(actor=actor, account=account, role=Account.Role.VISITOR)


def test_update_staff_account_refuses_to_touch_a_platform_admin():
    actor = _make_admin(email="admin1@example.com")
    other_admin = _make_admin(email="admin2@example.com")

    with pytest.raises(ValidationError):
        services.update_staff_account(actor=actor, account=other_admin, active=False)


# --------------------------------------------------------------------------
# deactivate_staff_account
# --------------------------------------------------------------------------


def test_deactivate_staff_account_soft_deletes():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")

    services.deactivate_staff_account(actor=actor, account=account)
    account.refresh_from_db()

    assert account.active is False
    assert Account.objects.filter(id=account.id).exists()  # never physically deleted


def test_deactivate_staff_account_bumps_token_version():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")
    starting_version = account.token_version

    services.deactivate_staff_account(actor=actor, account=account)
    account.refresh_from_db()

    assert account.token_version == starting_version + 1


def test_deactivate_staff_account_writes_audit_log():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com")

    services.deactivate_staff_account(actor=actor, account=account)

    entry = AuditLogEntry.objects.get(target_type="account", target_id=str(account.id))
    assert entry.action == "staff.deactivated"
    assert entry.actor_id == actor.id


def test_deactivate_staff_account_is_idempotent():
    actor = _make_admin()
    account = _make_staff(Account.Role.CASHIER, email="staff@example.com", active=False)

    services.deactivate_staff_account(actor=actor, account=account)

    assert not AuditLogEntry.objects.filter(
        target_type="account", target_id=str(account.id)
    ).exists()


def test_deactivate_staff_account_refuses_to_touch_a_platform_admin():
    actor = _make_admin(email="admin1@example.com")
    other_admin = _make_admin(email="admin2@example.com")

    with pytest.raises(ValidationError):
        services.deactivate_staff_account(actor=actor, account=other_admin)
