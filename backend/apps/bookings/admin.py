"""
Read-mostly support/debugging view for Platform Admin (mirrors
accounts.admin/catalog.admin). Booking lifecycle transitions go through
services.py (status/reference/rescheduled_count are all business-rule
governed), so those fields are read-only here.
"""

from django.contrib import admin

from .models import Booking, DateAvailability


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    ordering = ["-created_at"]
    list_display = [
        "reference",
        "visitor",
        "category_name_en",
        "visit_date",
        "booking_type",
        "status",
        "booked_quantity",
        "created_at",
    ]
    list_filter = ["status", "booking_type", "visit_date"]
    search_fields = ["reference", "visitor__email", "group_name"]
    readonly_fields = [
        "id",
        "reference",
        "status",
        "rescheduled_count",
        "checked_in_at",
        "checked_in_by_user_id",
        "category_corrected_at",
        "category_corrected_by_user_id",
        "chapa_checkout_url",
        "receipt_url",
        "ifmis_voucher_reference",
        "reconciliation",
        "created_at",
        "updated_at",
    ]


@admin.register(DateAvailability)
class DateAvailabilityAdmin(admin.ModelAdmin):
    ordering = ["visit_date"]
    list_display = ["visit_date", "is_open_for_booking", "closed_by_user_id", "closed_at"]
    list_filter = ["is_open_for_booking"]
    readonly_fields = ["created_at", "updated_at"]