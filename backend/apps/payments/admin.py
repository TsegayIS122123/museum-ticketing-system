"""
Read-mostly support/debugging view for Platform Admin (mirrors
bookings.admin/accounts.admin). A `Payment` row's lifecycle is entirely
services.py-governed (checkout creation, webhook confirmation), so every
field is read-only here.
"""

from django.contrib import admin

from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    ordering = ["-created_at"]
    list_display = [
        "tx_ref",
        "booking",
        "gateway",
        "amount_etb",
        "currency",
        "status",
        "confirmed_at",
        "created_at",
    ]
    list_filter = ["status", "gateway"]
    search_fields = ["tx_ref", "booking__reference", "booking__visitor__email"]
    readonly_fields = [
        "id",
        "booking",
        "tx_ref",
        "gateway",
        "amount_etb",
        "currency",
        "status",
        "checkout_url",
        "webhook_payload",
        "webhook_received_at",
        "confirmed_at",
        "created_at",
        "updated_at",
    ]

    def has_add_permission(self, request):
        # Payments are only ever created by services.create_checkout_session
        # (Sec 3.1) -- never by hand through the admin.
        return False
