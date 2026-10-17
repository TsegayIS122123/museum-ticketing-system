"""
accounts -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Under the unified account model (email + password for every role), the
account *lifecycle* -- registration, email verification (link + 6-digit
code), and password reset -- is owned by django-allauth and reached through
the headless endpoints at /_allauth/ (config/settings/base.py). What remains
here is the app's own session minting (`authenticate`) and the shared
profile update (`update_profile`), plus the staff provisioning hook used by
apps.platform_admin.

Neither of the two former split paths survives: there is no passwordless
OTP/magic-link flow, and there is no "Staff-only" login -- every account
proves the same email + password pair (FR-ACC-001..006, revised).
"""

from rest_framework.exceptions import AuthenticationFailed, ValidationError

from .authentication import AccountRefreshToken
from .models import Account


def authenticate(*, email, password):
    """Implements the single front-door sign-in (`POST /auth/login`).

    Role-agnostic: any active account with a usable password signs in the
    same way. The failure message is deliberately identical for "no such
    account", "wrong password", and "deactivated" so account state can't be
    probed (Sec 4.1). Returns (account, refresh_token).
    """
    email = Account.objects.normalize_email(email)
    try:
        account = Account.objects.get(email=email)
    except Account.DoesNotExist:
        account = None

    if account is None or not account.active or not account.check_password(password):
        raise AuthenticationFailed("Invalid email or password.")

    refresh = AccountRefreshToken.for_user(account)
    return account, refresh


def send_password_setup_email(*, account, request=None):
    """Ask allauth to send `account` its password-reset / "set password"
    email -- the channel a newly provisioned Staff account uses to choose its
    own first password (FR-ACC-005). Reuses allauth's own reset flow rather
    than duplicating the token machinery it now owns.
    """
    from allauth.account.forms import ResetPasswordForm

    form = ResetPasswordForm(data={"email": account.email})
    if form.is_valid():
        form.save(request=request)


def update_profile(*, account, full_name=None, phone=None, language_preference=None):
    """Implements the `/users/me` PUT path (Document 04 `UserUpdateRequest`)
    -- deliberately excludes email, role, and active: an account can never
    change its own role, email, or reactivate itself (Sec 4.3)."""
    if phone is not None and phone != account.phone:
        if Account.objects.exclude(pk=account.pk).filter(phone=phone).exists():
            raise ValidationError(
                {"phone": "This phone number is already associated with a different account."}
            )
        account.phone = phone
        # A changed phone number is a changed identity -- require
        # re-verification before it is trusted again (Sec 4.1).
        account.phone_verified_at = None

    if full_name is not None:
        account.full_name = full_name
    if language_preference is not None:
        account.language_preference = language_preference

    account.save()
    return account
