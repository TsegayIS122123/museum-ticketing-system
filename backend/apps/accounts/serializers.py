"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

Registration, email verification, and password reset are owned by
django-allauth (`/_allauth/...`, see config/settings/base.py); the serializers
here cover the app's own session endpoints (login) and the shared profile
endpoint (`/users/me`).
"""

from rest_framework import serializers

from .models import Account


class LoginSerializer(serializers.Serializer):
    """`LoginRequest` -- the single front-door sign-in for every role
    (visitor / cashier / museum_manager / platform_admin)."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class AccountSerializer(serializers.ModelSerializer):
    """`UserProfile` (Document 04) -- all four roles share one shape.

    `email_verified_at`/`phone_verified_at` are exposed (read-only) so the
    frontend can gate a Visitor's flow without having to guess at
    verification state or discover it only when a later action (like
    `create_booking`) rejects it. Email verification itself is tracked by
    django-allauth's `EmailAddress.verified` (the authoritative source for
    the headless flows); these columns are retained for backward
    compatibility."""

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
