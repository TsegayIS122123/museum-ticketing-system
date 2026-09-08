"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.
"""

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Account


class VisitorVerifyStartSerializer(serializers.Serializer):
    """`VisitorVerifyStartRequest` (Document 04) -- FR-ACC-001, FR-ACC-003.
    No password field exists here or anywhere in the Visitor path."""

    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32)
    full_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    language_preference = serializers.ChoiceField(
        choices=Account.Language.choices, required=False, default=None
    )


class VisitorVerifyConfirmSerializer(serializers.Serializer):
    """`VisitorVerifyConfirmRequest`."""

    verification_id = serializers.UUIDField()
    otp_code = serializers.CharField(max_length=6, min_length=6, trim_whitespace=False)


class StaffLoginSerializer(serializers.Serializer):
    """`LoginRequest` -- Staff only (FR-ACC-002, FR-ACC-005)."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class ForgotPasswordSerializer(serializers.Serializer):
    """`ForgotPasswordRequest` -- Staff only (FR-ACC-006)."""

    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    """`ResetPasswordRequest` -- Staff only (FR-ACC-006)."""

    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value):
        # Runs the same AUTH_PASSWORD_VALIDATORS as any other Staff
        # password set -- see services.reset_password for the second,
        # authoritative check against the actual account.
        validate_password(value)
        return value


class AccountSerializer(serializers.ModelSerializer):
    """`UserProfile` (Document 04) -- Visitor and Staff share one shape; a
    Visitor's password-adjacent fields are simply never populated.

    `email_verified_at`/`phone_verified_at` are exposed (read-only) so the
    frontend can gate a Visitor's flow -- e.g. requiring email verification
    right after OTP confirmation (FR-ACC-003) -- without having to guess at
    verification state or discover it only when a later action (like
    `create_booking`) rejects it."""

    class Meta:
        model = Account
        fields = [
            "id",
            "email",
            "phone",
            "full_name",
            "role",
            "language_preference",
            "active",
            "email_verified_at",
            "phone_verified_at",
            "created_at",
        ]
        read_only_fields = fields


class AccountUpdateSerializer(serializers.ModelSerializer):
    """`UserUpdateRequest` -- an account may only ever edit its own
    contact/preference fields, never role/active/email (Sec 4.3)."""

    class Meta:
        model = Account
        fields = ["full_name", "phone", "language_preference"]
        extra_kwargs = {
            "full_name": {"required": False},
            "phone": {"required": False},
            "language_preference": {"required": False},
        }