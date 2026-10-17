"""
Unit tests against accounts/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage.

The account lifecycle (register / email-verify / password-reset) now lives
in django-allauth and is exercised through the headless endpoints; these
tests cover the app's own session minting and the shared profile update.
"""

from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from apps.accounts import services
from apps.accounts.models import Account

pytestmark = pytest.mark.django_db


def _make(email="v@example.com", password="a-strong-password-1", role=Account.Role.VISITOR, full_name="Person"):
    account = Account(email=email, full_name=full_name, role=role)
    if password is None:
        account.set_unusable_password()
    else:
        account.set_password(password)
    account.save()
    return account


# --------------------------------------------------------------------------
# authenticate -- single front-door sign-in for every role
# --------------------------------------------------------------------------


def test_authenticate_with_correct_credentials_issues_tokens_for_a_visitor():
    account = _make(role=Account.Role.VISITOR)

    verified, refresh = services.authenticate(
        email="v@example.com", password="a-strong-password-1"
    )

    assert verified.id == account.id
    assert refresh["token_version"] == account.token_version


def test_authenticate_with_correct_credentials_issues_tokens_for_staff():
    account = _make(email="cashier@example.com", role=Account.Role.CASHIER)

    verified, refresh = services.authenticate(
        email="cashier@example.com", password="a-strong-password-1"
    )

    assert verified.id == account.id
    assert refresh["token_version"] == account.token_version


def test_authenticate_rejects_wrong_password():
    _make(email="cashier@example.com", role=Account.Role.CASHIER)

    with pytest.raises(AuthenticationFailed):
        services.authenticate(email="cashier@example.com", password="wrong-password")


def test_authenticate_rejects_unknown_email():
    with pytest.raises(AuthenticationFailed):
        services.authenticate(email="nobody@example.com", password="anything")


def test_authenticate_rejects_account_without_a_usable_password():
    _make(email="nopassword@example.com", password=None)

    with pytest.raises(AuthenticationFailed):
        services.authenticate(email="nopassword@example.com", password="anything")


def test_authenticate_rejects_inactive_account():
    _make(email="inactive@example.com", role=Account.Role.CASHIER)
    Account.objects.filter(email="inactive@example.com").update(active=False)

    with pytest.raises(AuthenticationFailed):
        services.authenticate(email="inactive@example.com", password="a-strong-password-1")


# --------------------------------------------------------------------------
# send_password_setup_email
# --------------------------------------------------------------------------


def test_send_password_setup_email_delegates_to_allauth_reset_form():
    account = _make(email="newstaff@example.com", password=None, role=Account.Role.CASHIER)

    with mock.patch("allauth.account.forms.ResetPasswordForm.save") as mock_save:
        services.send_password_setup_email(account=account)

    mock_save.assert_called_once()


# --------------------------------------------------------------------------
# update_profile
# --------------------------------------------------------------------------


def test_update_profile_updates_allowed_fields():
    account = _make(full_name="Old Name")

    updated = services.update_profile(
        account=account, full_name="New Name", language_preference=Account.Language.AMHARIC
    )

    assert updated.full_name == "New Name"
    assert updated.language_preference == Account.Language.AMHARIC


def test_update_profile_changing_phone_clears_phone_verification():
    account = _make()
    account.phone = "+251911000011"
    account.phone_verified_at = timezone.now()
    account.save(update_fields=["phone", "phone_verified_at"])

    updated = services.update_profile(account=account, phone="+251911000012")

    assert updated.phone_verified_at is None


def test_update_profile_rejects_phone_owned_by_another_account():
    _make(email="other@example.com", full_name="Other")
    Account.objects.filter(email="other@example.com").update(phone="+251911000013")
    account = _make(email="v@example.com")

    with pytest.raises(ValidationError):
        services.update_profile(account=account, phone="+251911000013")
