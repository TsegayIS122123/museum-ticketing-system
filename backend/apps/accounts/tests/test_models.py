"""
Unit tests against accounts/models.py's Django-admin-access attributes
(is_staff / is_superuser / has_perm / has_module_perms). These exist to
keep /admin/ login working -- see the block comment on Account in
models.py for why PermissionsMixin itself is deliberately not used.
"""

import pytest

from apps.accounts.models import Account

pytestmark = pytest.mark.django_db


def _make(role, email="person@example.com"):
    account = Account(email=email, full_name="Person", role=role)
    if role == Account.Role.VISITOR:
        account.set_unusable_password()
    else:
        account.set_password("a-strong-password-1")
    account.save()
    return account


@pytest.mark.parametrize(
    "role",
    [Account.Role.VISITOR, Account.Role.CASHIER, Account.Role.MUSEUM_MANAGER],
)
def test_non_platform_admin_roles_cannot_access_admin_site(role):
    account = _make(role, email=f"{role}@example.com")

    assert account.is_staff is False
    assert account.is_superuser is False
    assert account.has_perm("any.permission") is False
    assert account.has_module_perms("any_app") is False


def test_platform_admin_can_access_admin_site():
    account = _make(Account.Role.PLATFORM_ADMIN, email="admin@example.com")

    assert account.is_staff is True
    assert account.is_superuser is True
    assert account.has_perm("any.permission") is True
    assert account.has_module_perms("any_app") is True


def test_has_perm_and_has_module_perms_ignore_the_obj_and_app_label_args():
    """No per-object/per-app granularity exists (all-or-nothing per the
    docstring) -- confirm arbitrary values don't change the outcome."""
    platform_admin = _make(Account.Role.PLATFORM_ADMIN, email="admin2@example.com")
    cashier = _make(Account.Role.CASHIER, email="cashier2@example.com")

    assert platform_admin.has_perm("accounts.delete_account", obj=cashier) is True
    assert cashier.has_perm("accounts.delete_account", obj=platform_admin) is False
    assert platform_admin.has_module_perms("nonexistent_app") is True
    assert cashier.has_module_perms("nonexistent_app") is False


def test_role_change_is_reflected_immediately_since_these_are_properties():
    """Regression guard: is_staff/is_superuser must stay computed from
    `role`, not cached at instantiation or set as plain fields -- a role
    change (FR-ACC-005) should take effect without any extra step."""
    account = _make(Account.Role.CASHIER, email="promoted@example.com")
    assert account.is_staff is False

    account.role = Account.Role.PLATFORM_ADMIN
    assert account.is_staff is True
    assert account.is_superuser is True