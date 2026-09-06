"""
Read-mostly support/debugging view for Platform Admin (mirrors
accounts.admin/catalog.admin). Booking lifecycle transitions go through
services.py (status/reference/rescheduled_count are all business-rule
governed), so those fields are read-only here.
"""

from django.contrib import admin

from .models import Booking, BookingItem, DateAvailability


class BookingItemInline(admin.TabularInline):
    """Read-only -- line items are only ever created together with their
    parent booking, or corrected in place via the Cashier-only gate
    correction flow, never edited here."""

    model = BookingItem
    extra = 0
    can_delete = False
    fields = ["category_name_en", "category_name_am", "quantity", "unit_price_etb", "subtotal_etb"]
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


def _categories_summary(booking):
    """e.g. \"Adult x1, Student x2\" -- list_display has no easy way to
    show a related-row breakdown itself, so this composes the same
    summary the visitor-facing UI shows for each row."""
    return ", ".join(f"{item.category_name_en} x{item.quantity}" for item in booking.items.all())


_categories_summary.short_description = "Categories"


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    ordering = ["-created_at"]
    list_display = [
        "reference",
        "visitor",
        _categories_summary,
        "visit_date",
        "booking_type",
        "status",
        "booked_quantity",
        "created_at",
    ]
    list_filter = ["status", "booking_type", "visit_date"]
    search_fields = ["reference", "visitor__email", "group_name", "group_tin"]
    inlines = [BookingItemInline]

    def get_queryset(self, request):
        # _categories_summary above reads `booking.items.all()` for every
        # row in the changelist -- prefetch once instead of N+1.
        return super().get_queryset(request).prefetch_related("items")

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