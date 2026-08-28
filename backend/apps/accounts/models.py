"""
accounts -- models

Implements FR modules: FR-ACC
Depends on: core

Per Design Spec Sec 4.1: a single Account model serves all four roles via
two different credential mechanisms:

- Visitor: passwordless. No password ever set; identity is proven per-flow
  by an OTP (SMS, 6 digits, 10-min expiry, rate-limited -- Sec 6.7) or a
  magic link (email), and re-verifying the same email/phone is what lets a
  returning Visitor be recognized (FR-ACC-004). No "forgot password" flow
  applies to this path (FR-ACC-006 is Staff-only).
- Staff (Cashier / Museum Manager / Platform Admin): conventional
  password-based login, with a time-limited password-reset link by email
  (FR-ACC-006).

AUTH_USER_MODEL = "accounts.Account" (config/settings/base.py) -- this must
be the first app migrated (see README "Build order").

Per ADR-002: a `token_version` column is what makes immediate access-token
revocation possible despite stateless JWTs -- bump it to invalidate all of
an account's outstanding access tokens (e.g. on password reset).

See Document 05 for the authoritative column list (role, language
preference, token_version, phone/email verification state, etc).
"""

import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel

# Document 05 Sec 3.1 calls for a CITEXT `email` column (case-insensitive,
# so "Visitor@x.com" and "visitor@x.com" never create two rows). CITextField
# is removed as of Django 5.1 (fields.E907) -- its own hint is followed here:
# a non-deterministic, case-insensitive collation on a plain TextField,
# created once per database by migration 0001 (CREATE COLLATION ...).
CASE_INSENSITIVE_COLLATION = "case_insensitive"


class AccountManager(BaseUserManager):
    """
    Per Document 05 Sec 3.1: `email` (not `username`) is the natural key for
    every Account, Visitor or Staff alike -- there is no username column.
    """

    use_in_migrations = True

    def _create(self, *, email, password, role, **extra_fields):
        if not email:
            raise ValueError("Account requires an email address.")
        email = self.normalize_email(email)
        account = self.model(email=email, role=role, **extra_fields)
        if password is not None:
            account.set_password(password)
        else:
            account.set_unusable_password()
        account.save(using=self._db)
        return account

    def create_user(self, email, password=None, **extra_fields):
        """Visitor accounts are normally get-or-created by services.py on
        first OTP verification (FR-ACC-001), never with a password. This
        entry point mainly exists for Staff provisioning and tests."""
        extra_fields.setdefault("role", Account.Role.VISITOR)
        return self._create(email=email, password=password, **extra_fields)

    def create_superuser(self, email, password, **extra_fields):
        """Platform Admin bootstrap only (`manage.py createsuperuser`) --
        every other Staff account is provisioned by an existing Platform
        Admin per FR-ACC-005, not via this command."""
        if not password:
            raise ValueError("A Platform Admin account requires a password.")
        extra_fields["role"] = Account.Role.PLATFORM_ADMIN
        return self._create(email=email, password=password, **extra_fields)


class Account(AbstractBaseUser, TimeStampedModel):
    """
    Implements FR-ACC-001 - FR-ACC-007 (Document 02) / Document 05 Sec 3.1.

    A single table serves Visitor and Staff (Cashier / Museum Manager /
    Platform Admin) alike -- authorization is a flat `role` check
    (Document 03 Sec 4.3), not a type hierarchy, per ADR-004's single-venue
    simplification. `password` is nullable because Visitors never have one
    (Sec 4.1); the OTP/magic-link/reset columns below are the credential
    state for the two verification flows that stand in for it.
    """

    class Role(models.TextChoices):
        VISITOR = "visitor", "Visitor"
        CASHIER = "cashier", "Cashier"
        MUSEUM_MANAGER = "museum_manager", "Museum Manager"
        PLATFORM_ADMIN = "platform_admin", "Platform Admin"

    class Language(models.TextChoices):
        ENGLISH = "en", "English"
        AMHARIC = "am", "Amharic"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Case-insensitive (via CASE_INSENSITIVE_COLLATION, see above) so
    # "Visitor@Example.com" and "visitor@example.com" never create two
    # accounts (Document 05 Sec 3.1).
    email = models.TextField(unique=True, db_collation=CASE_INSENSITIVE_COLLATION)
    phone = models.TextField(unique=True, null=True, blank=True)

    # AbstractBaseUser already provides `password` (Argon2-hashed via
    # PASSWORD_HASHERS) and `last_login`; just relax NOT NULL so a Visitor
    # row can carry no password at all (Sec 4.1) -- see the CheckConstraint
    # below, which is the DB-level enforcement of that same rule.
    password = models.CharField(max_length=128, null=True, blank=True)

    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VISITOR)
    language_preference = models.CharField(
        max_length=2, choices=Language.choices, default=Language.ENGLISH
    )

    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)

    # Visitor OTP verification (FR-ACC-001, Document 03 Sec 4.1.1). Cleared
    # on successful verification or expiry; never logged in plaintext.
    phone_otp_hash = models.CharField(max_length=128, null=True, blank=True)
    phone_otp_expires_at = models.DateTimeField(null=True, blank=True)
    phone_otp_attempts = models.PositiveSmallIntegerField(default=0)

    # Visitor magic-link verification (secondary/fallback channel).
    email_verification_token_hash = models.CharField(max_length=128, null=True, blank=True)
    email_verification_expires_at = models.DateTimeField(null=True, blank=True)

    # Staff-only password reset (FR-ACC-006) -- always NULL for a Visitor.
    password_reset_token_hash = models.CharField(max_length=128, null=True, blank=True)
    password_reset_expires_at = models.DateTimeField(null=True, blank=True)

    active = models.BooleanField(default=True)

    # ADR-002: bump to invalidate every outstanding stateless JWT access
    # token for this account (e.g. on password reset) without waiting out
    # the 15-minute access-token expiry.
    token_version = models.PositiveIntegerField(default=0)

    objects = AccountManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        app_label = "accounts"
        db_table = "account"
        constraints = [
            models.CheckConstraint(
                condition=Q(role="visitor") | Q(password__isnull=False),
                name="account_staff_requires_password",
            ),
        ]
        indexes = [
            models.Index(
                fields=["role"],
                name="account_active_role_idx",
                condition=Q(active=True),
            ),
        ]

    def __str__(self):
        return self.email

    @property
    def is_active(self):
        """Bridges Document 05's `active` flag to the attribute Django's
        auth backends check (`user_can_authenticate`) -- a deactivated
        Staff account (Sec 1.3: never deleted, only flagged) can no longer
        authenticate."""
        return self.active

    @property
    def is_staff_role(self):
        """Any of Cashier / Museum Manager / Platform Admin -- i.e. not a
        Visitor (mirrors core.permissions.IsStaff)."""
        return self.role in {
            self.Role.CASHIER,
            self.Role.MUSEUM_MANAGER,
            self.Role.PLATFORM_ADMIN,
        }
