"""
Unit tests against accounts/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage.
"""

from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from apps.accounts import services
from apps.accounts.models import Account

pytestmark = pytest.mark.django_db


def _make_visitor(email="v@example.com", phone="", full_name="V"):
    account = Account(email=email, phone=phone, full_name=full_name, role=Account.Role.VISITOR)
    account.set_unusable_password()
    account.save()
    return account


def _make_staff(email="cashier@example.com", password="a-strong-password-1", role=Account.Role.CASHIER):
    account = Account(email=email, full_name="Staff Person", role=role)
    account.set_password(password)
    account.save()
    return account


def _last_context(mock_delay, notification_type):
    for call in reversed(mock_delay.call_args_list):
        if call.kwargs.get("notification_type") == notification_type:
            return call.kwargs["context"]
    raise AssertionError(f"no {notification_type} notification was enqueued")


# --------------------------------------------------------------------------
# start_visitor_verification
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_start_visitor_verification_creates_account_and_sends_otp_and_link(mock_delay):
    account, expires_in = services.start_visitor_verification(
        email="Visitor@Example.com", phone="+251911000000"
    )

    assert Account.objects.count() == 1
    # normalize_email only lowercases the domain (Django convention);
    # case-insensitive *matching* is the db_collation's job (models.py).
    assert account.email == "Visitor@example.com"
    assert account.role == Account.Role.VISITOR
    assert not account.has_usable_password()
    assert account.phone_otp_hash is not None
    assert account.email_verification_token_hash is not None
    assert expires_in == int(services.OTP_EXPIRY.total_seconds())
    assert mock_delay.call_count == 2


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_start_visitor_verification_matches_existing_account_by_email(mock_delay):
    first, _ = services.start_visitor_verification(email="v@example.com", phone="+251911000001")
    second, _ = services.start_visitor_verification(email="v@example.com", phone="+251911000001")

    assert first.id == second.id
    assert Account.objects.count() == 1


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_start_visitor_verification_rejects_phone_owned_by_a_different_account(mock_delay):
    services.start_visitor_verification(email="a@example.com", phone="+251911000002")

    with pytest.raises(ValidationError):
        services.start_visitor_verification(email="b@example.com", phone="+251911000002")


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_start_visitor_verification_rejects_staff_email(mock_delay):
    _make_staff(email="staff@example.com")

    with pytest.raises(ValidationError):
        services.start_visitor_verification(email="staff@example.com", phone="+251911000003")


# --------------------------------------------------------------------------
# confirm_visitor_verification
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_confirm_visitor_verification_with_correct_otp_issues_tokens(mock_delay):
    account, _ = services.start_visitor_verification(email="v@example.com", phone="+251911000005")
    otp_code = _last_context(mock_delay, "visitor_otp")["otp_code"]

    verified_account, refresh = services.confirm_visitor_verification(
        verification_id=account.id, otp_code=otp_code
    )

    verified_account.refresh_from_db()
    assert verified_account.phone_verified_at is not None
    assert verified_account.phone_otp_hash is None
    assert refresh["token_version"] == verified_account.token_version


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_confirm_visitor_verification_with_incorrect_otp_increments_attempts(mock_delay):
    account, _ = services.start_visitor_verification(email="v@example.com", phone="+251911000006")

    with pytest.raises(ValidationError):
        services.confirm_visitor_verification(verification_id=account.id, otp_code="000000")

    account.refresh_from_db()
    assert account.phone_otp_attempts == 1
    assert account.phone_verified_at is None


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_confirm_visitor_verification_locks_out_after_max_attempts(mock_delay):
    account, _ = services.start_visitor_verification(email="v@example.com", phone="+251911000007")
    account.phone_otp_attempts = services.OTP_MAX_ATTEMPTS
    account.save(update_fields=["phone_otp_attempts"])

    with pytest.raises(ValidationError):
        services.confirm_visitor_verification(verification_id=account.id, otp_code="000000")


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_confirm_visitor_verification_rejects_expired_otp(mock_delay):
    account, _ = services.start_visitor_verification(email="v@example.com", phone="+251911000008")
    otp_code = _last_context(mock_delay, "visitor_otp")["otp_code"]
    account.phone_otp_expires_at = timezone.now() - services.OTP_EXPIRY
    account.save(update_fields=["phone_otp_expires_at"])

    with pytest.raises(ValidationError):
        services.confirm_visitor_verification(verification_id=account.id, otp_code=otp_code)


# --------------------------------------------------------------------------
# confirm_email_verification
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_confirm_email_verification_with_valid_token_marks_verified(mock_delay):
    services.start_visitor_verification(email="v@example.com", phone="+251911000009")
    token = _last_context(mock_delay, "visitor_email_verification")["verification_token"]

    verified = services.confirm_email_verification(token=token)

    assert verified.email_verified_at is not None
    assert verified.email_verification_token_hash is None


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_confirm_email_verification_token_is_single_use(mock_delay):
    services.start_visitor_verification(email="v@example.com", phone="+251911000010")
    token = _last_context(mock_delay, "visitor_email_verification")["verification_token"]
    services.confirm_email_verification(token=token)

    with pytest.raises(ValidationError):
        services.confirm_email_verification(token=token)


def test_confirm_email_verification_rejects_tampered_token():
    with pytest.raises(ValidationError):
        services.confirm_email_verification(token="not-a-real-token")


# --------------------------------------------------------------------------
# staff_login
# --------------------------------------------------------------------------


def test_staff_login_with_correct_credentials_issues_tokens():
    account = _make_staff()

    verified, refresh = services.staff_login(email="cashier@example.com", password="a-strong-password-1")

    assert verified.id == account.id
    assert refresh["token_version"] == account.token_version


def test_staff_login_rejects_wrong_password():
    _make_staff()

    with pytest.raises(AuthenticationFailed):
        services.staff_login(email="cashier@example.com", password="wrong-password")


def test_staff_login_rejects_visitor_account():
    _make_visitor(email="visitor@example.com")

    with pytest.raises(AuthenticationFailed):
        services.staff_login(email="visitor@example.com", password="anything")


def test_staff_login_rejects_inactive_staff():
    _make_staff(email="inactive@example.com")
    Account.objects.filter(email="inactive@example.com").update(active=False)

    with pytest.raises(AuthenticationFailed):
        services.staff_login(email="inactive@example.com", password="a-strong-password-1")


# --------------------------------------------------------------------------
# request_password_reset / reset_password
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_request_password_reset_for_unknown_email_is_a_silent_no_op(mock_delay):
    services.request_password_reset(email="nobody@example.com")

    mock_delay.assert_not_called()


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_request_password_reset_for_visitor_is_a_silent_no_op(mock_delay):
    _make_visitor(email="visitor@example.com")

    services.request_password_reset(email="visitor@example.com")

    mock_delay.assert_not_called()


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_reset_password_with_valid_token_bumps_token_version(mock_delay):
    account = _make_staff()
    old_version = account.token_version
    services.request_password_reset(email=account.email)
    token = _last_context(mock_delay, "staff_password_reset")["reset_token"]

    services.reset_password(token=token, new_password="a-new-strong-password-2")

    account.refresh_from_db()
    assert account.check_password("a-new-strong-password-2")
    assert account.token_version == old_version + 1
    assert account.password_reset_token_hash is None


@mock.patch("apps.notifications.tasks.send_notification.delay")
def test_reset_password_token_is_single_use(mock_delay):
    account = _make_staff()
    services.request_password_reset(email=account.email)
    token = _last_context(mock_delay, "staff_password_reset")["reset_token"]
    services.reset_password(token=token, new_password="a-new-strong-password-2")

    with pytest.raises(ValidationError):
        services.reset_password(token=token, new_password="another-strong-password-3")


def test_reset_password_rejects_bad_token():
    with pytest.raises(ValidationError):
        services.reset_password(token="garbage", new_password="a-new-strong-password-2")


# --------------------------------------------------------------------------
# update_profile
# --------------------------------------------------------------------------


def test_update_profile_updates_allowed_fields():
    account = _make_visitor(full_name="Old Name")

    updated = services.update_profile(
        account=account, full_name="New Name", language_preference=Account.Language.AMHARIC
    )

    assert updated.full_name == "New Name"
    assert updated.language_preference == Account.Language.AMHARIC


def test_update_profile_changing_phone_clears_visitor_verification():
    account = _make_visitor(phone="+251911000011")
    account.phone_verified_at = timezone.now()
    account.save(update_fields=["phone_verified_at"])

    updated = services.update_profile(account=account, phone="+251911000012")

    assert updated.phone_verified_at is None


def test_update_profile_rejects_phone_owned_by_another_account():
    _make_visitor(email="other@example.com", phone="+251911000013", full_name="Other")
    account = _make_visitor(email="v@example.com")

    with pytest.raises(ValidationError):
        services.update_profile(account=account, phone="+251911000013")