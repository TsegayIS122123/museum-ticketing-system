"""
accounts -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Two credential mechanisms, one token pair (Sec 4.1):
  - Visitor:  start_visitor_verification -> confirm_visitor_verification
              (+ confirm_email_verification for the secondary channel)
  - Staff:    staff_login, request_password_reset, reset_password

Neither path is ever mixed: a Staff row can't be verified via OTP, and a
Visitor row can't log in with a password (enforced below, not just by
which endpoint the caller happened to use).
"""

import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from .authentication import AccountRefreshToken
from .models import Account

# Document 03 Sec 4.1 / Sec 6.7: 6-digit OTP, 10-minute expiry, rate-limited
# (throttle scope "otp-request", see core/throttling.py + settings).
OTP_LENGTH = 6
OTP_EXPIRY = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5

# Not pinned down by Document 05 -- a magic link conventionally outlives an
# SMS OTP since email is the slower/fallback channel (Sec 4.1 step 2).
# Revisit if Document 02's open questions (Sec 5) settle on a specific value.
EMAIL_VERIFICATION_EXPIRY = timedelta(hours=24)

# Password-reset links are short-lived and include a random nonce so two
# requests for the same account never produce the same signed token.
PASSWORD_RESET_EXPIRY = timedelta(minutes=10)

EMAIL_VERIFICATION_SALT = "accounts.email-verification"
PASSWORD_RESET_SALT = "accounts.password-reset"

_INVALID_OR_EXPIRED_CODE = "Invalid or expired code."
_INVALID_OR_EXPIRED_LINK = "Invalid or expired link."


def _hash_token(raw: str) -> str:
    """One-way hash for anything stored in a `*_hash` column (Document 05
    Sec 3.1) -- never the raw OTP/token itself, mirroring how `password` is
    never stored in the clear."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_otp_code() -> str:
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


# --------------------------------------------------------------------------
# Visitor path -- passwordless (FR-ACC-001, FR-ACC-003, FR-ACC-004)
# --------------------------------------------------------------------------


def start_visitor_verification(*, email, phone, full_name="", language_preference=None):
    """Implements FR-ACC-001, FR-ACC-003, FR-ACC-004: find-or-create the
    Account by email, (re)issue an OTP + email-verification token, and hand
    both off to notifications (never sent synchronously -- NFR-PERF-001).

    Returns (account, otp_expires_in_seconds).
    """
    email = Account.objects.normalize_email(email)
    phone = phone.strip()

    if Account.objects.filter(phone=phone).exclude(email=email).exists():
        raise ValidationError(
            {"phone": "This phone number is already associated with a different account."}
        )

    try:
        account = Account.objects.get(email=email)
    except Account.DoesNotExist:
        account = Account(
            email=email,
            phone=phone,
            full_name=full_name or "",
            role=Account.Role.VISITOR,
            language_preference=language_preference or Account.Language.ENGLISH,
        )
        account.set_unusable_password()
    else:
        if account.is_staff_role:
            # Sec 4.1: the two credential paths never cross -- a Staff
            # email can't be repurposed for passwordless verification.
            raise ValidationError({"email": "This email is registered to a staff account."})
        if phone and account.phone != phone:
            account.phone = phone
        if full_name and not account.full_name:
            account.full_name = full_name
        if language_preference:
            account.language_preference = language_preference

    now = timezone.now()

    otp_code = _generate_otp_code()
    account.phone_otp_hash = _hash_token(otp_code)
    account.phone_otp_expires_at = now + OTP_EXPIRY
    account.phone_otp_attempts = 0

    email_token = signing.dumps({"account_id": str(account.id)}, salt=EMAIL_VERIFICATION_SALT)
    account.email_verification_token_hash = _hash_token(email_token)
    account.email_verification_expires_at = now + EMAIL_VERIFICATION_EXPIRY

    account.save()

    from apps.notifications.tasks import send_notification

    send_notification.delay(
        account_id=str(account.id),
        notification_type="visitor_otp",
        context={"otp_code": otp_code, "expires_in_seconds": int(OTP_EXPIRY.total_seconds())},
    )
    send_notification.delay(
        account_id=str(account.id),
        notification_type="visitor_email_verification",
        context={"verification_token": email_token},
    )

    return account, int(OTP_EXPIRY.total_seconds())


def confirm_visitor_verification(*, verification_id, otp_code):
    """Implements FR-ACC-001, FR-ACC-003, FR-ACC-004 -- the OTP is the only
    credential a Visitor ever proves; success issues the same token pair
    Staff login does (Sec 4.1). Returns (account, refresh_token)."""
    try:
        account = Account.objects.get(id=verification_id, role=Account.Role.VISITOR)
    except Account.DoesNotExist:
        raise ValidationError(_INVALID_OR_EXPIRED_CODE)

    if not account.phone_otp_hash or not account.phone_otp_expires_at:
        raise ValidationError(_INVALID_OR_EXPIRED_CODE)

    if account.phone_otp_attempts >= OTP_MAX_ATTEMPTS:
        raise ValidationError("Too many incorrect attempts. Request a new code.")

    if account.phone_otp_expires_at < timezone.now():
        raise ValidationError(_INVALID_OR_EXPIRED_CODE)

    if not secrets.compare_digest(account.phone_otp_hash, _hash_token(otp_code)):
        account.phone_otp_attempts += 1
        account.save(update_fields=["phone_otp_attempts"])
        raise ValidationError(_INVALID_OR_EXPIRED_CODE)

    account.phone_verified_at = timezone.now()
    account.phone_otp_hash = None
    account.phone_otp_expires_at = None
    account.phone_otp_attempts = 0
    account.save()

    refresh = AccountRefreshToken.for_user(account)
    return account, refresh


def confirm_email_verification(*, token):
    """Implements the secondary/fallback verification channel (Sec 4.1 step
    2): opening the emailed link marks `email_verified_at` but never issues
    a session on its own -- only the OTP path (above) does that."""
    try:
        payload = signing.loads(
            token,
            salt=EMAIL_VERIFICATION_SALT,
            max_age=EMAIL_VERIFICATION_EXPIRY.total_seconds(),
        )
    except signing.SignatureExpired:
        raise ValidationError(_INVALID_OR_EXPIRED_LINK)
    except signing.BadSignature:
        raise ValidationError(_INVALID_OR_EXPIRED_LINK)

    try:
        account = Account.objects.get(id=payload["account_id"])
    except Account.DoesNotExist:
        raise ValidationError(_INVALID_OR_EXPIRED_LINK)

    if account.email_verification_token_hash != _hash_token(token):
        # Already used, or superseded by a later verify/start call.
        raise ValidationError(_INVALID_OR_EXPIRED_LINK)

    account.email_verified_at = timezone.now()
    account.email_verification_token_hash = None
    account.email_verification_expires_at = None
    account.save()
    return account


# --------------------------------------------------------------------------
# Staff path -- password-based (FR-ACC-002, FR-ACC-005, FR-ACC-006)
# --------------------------------------------------------------------------


def staff_login(*, email, password):
    """Implements FR-ACC-002, FR-ACC-005. Returns (account, refresh_token)."""
    email = Account.objects.normalize_email(email)
    try:
        account = Account.objects.get(email=email)
    except Account.DoesNotExist:
        account = None

    if (
        account is None
        or not account.is_staff_role
        or not account.active
        or not account.check_password(password)
    ):
        # Deliberately identical for "no such account", "wrong password",
        # and "that's a Visitor row" -- Sec 4.1's credential-path split
        # must not be discoverable by probing error messages.
        raise AuthenticationFailed("Invalid email or password.")

    refresh = AccountRefreshToken.for_user(account)
    return account, refresh


def request_password_reset(*, email):
    """Implements FR-ACC-006. Always a no-op from the caller's point of
    view when `email` doesn't match an active Staff account (Document 04:
    /auth/forgot-password never discloses account existence) -- returns
    None either way."""
    email = Account.objects.normalize_email(email)
    try:
        account = Account.objects.get(email=email)
    except Account.DoesNotExist:
        return

    if not account.is_staff_role or not account.active:
        return

    reset_token = signing.dumps(
        {"account_id": str(account.id), "nonce": secrets.token_urlsafe(32)},
        salt=PASSWORD_RESET_SALT,
    )
    account.password_reset_token_hash = _hash_token(reset_token)
    account.password_reset_expires_at = timezone.now() + PASSWORD_RESET_EXPIRY
    account.save(update_fields=["password_reset_token_hash", "password_reset_expires_at"])

    from apps.notifications.tasks import send_notification

    send_notification.delay(
        account_id=str(account.id),
        notification_type="staff_password_reset",
        context={"reset_token": reset_token},
    )


def reset_password(*, token, new_password):
    """Implements FR-ACC-006. Bumps `token_version` (ADR-002) so every
    access token issued before this reset stops working immediately rather
    than remaining valid for up to its 15-minute lifetime."""
    try:
        payload = signing.loads(
            token, salt=PASSWORD_RESET_SALT, max_age=PASSWORD_RESET_EXPIRY.total_seconds()
        )
    except (signing.BadSignature, signing.SignatureExpired):
        raise ValidationError("Invalid or expired reset token.")

    try:
        account = Account.objects.get(id=payload["account_id"])
    except Account.DoesNotExist:
        raise ValidationError("Invalid or expired reset token.")

    if (
        not account.password_reset_token_hash
        or account.password_reset_token_hash != _hash_token(token)
        or not account.password_reset_expires_at
        or account.password_reset_expires_at < timezone.now()
    ):
        raise ValidationError("Invalid or expired reset token.")

    validate_password(new_password, account)

    account.set_password(new_password)
    account.password_reset_token_hash = None
    account.password_reset_expires_at = None
    account.token_version += 1
    account.save()
    return account


# --------------------------------------------------------------------------
# Shared -- /users/me (Visitor and Staff alike, Sec 4.3)
# --------------------------------------------------------------------------


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
        if account.role == Account.Role.VISITOR:
            # A changed phone number is a changed identity for a Visitor
            # (Sec 4.1) -- require re-verification before it's trusted again.
            account.phone_verified_at = None

    if full_name is not None:
        account.full_name = full_name
    if language_preference is not None:
        account.language_preference = language_preference

    account.save()
    return account