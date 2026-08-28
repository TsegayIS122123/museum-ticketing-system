"""
Internal support/debugging view of Account only. Staff provisioning is
FR-ACC-002 / apps.platform_admin's job, not the Django admin (Sec 1.3) --
so creation is disabled here and every credential-state field is read-only.
"""

from django.contrib import admin

from .models import Account


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    ordering = ["email"]
    list_display = ["email", "full_name", "role", "active", "created_at"]
    list_filter = ["role", "active", "language_preference"]
    search_fields = ["email", "phone", "full_name"]

    readonly_fields = [
        "id",
        "created_at",
        "updated_at",
        "last_login",
        "password",
        "phone_otp_hash",
        "phone_otp_expires_at",
        "phone_otp_attempts",
        "email_verification_token_hash",
        "email_verification_expires_at",
        "password_reset_token_hash",
        "password_reset_expires_at",
        "token_version",
    ]
    fieldsets = (
        (None, {"fields": ("id", "email", "phone", "password")}),
        ("Profile", {"fields": ("full_name", "role", "language_preference", "active")}),
        (
            "Verification state",
            {
                "fields": (
                    "email_verified_at",
                    "phone_verified_at",
                    "phone_otp_hash",
                    "phone_otp_expires_at",
                    "phone_otp_attempts",
                    "email_verification_token_hash",
                    "email_verification_expires_at",
                )
            },
        ),
        (
            "Security",
            {
                "fields": (
                    "password_reset_token_hash",
                    "password_reset_expires_at",
                    "token_version",
                    "last_login",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def has_add_permission(self, request):
        # Every Account is provisioned via the API (Visitor: OTP first-use;
        # Staff: apps.platform_admin), never hand-typed into this admin.
        return False