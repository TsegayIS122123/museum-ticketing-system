"""
A Museum Manager manages categories through the API (FR-CAT-002); this
admin view is for Platform Admin support/debugging, mirroring
accounts.admin's read-mostly approach. Unlike Account, adding a Category
here is left enabled -- there's no OTP/token-issuing provisioning flow for
it to bypass, so a hand-typed row is no different from one made via POST.
"""

from django.contrib import admin

from .models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    ordering = ["name_en"]
    list_display = ["name_en", "name_am", "price_etb", "is_free", "active", "created_at"]
    list_filter = ["active", "is_free"]
    search_fields = ["name_en", "name_am"]
    readonly_fields = ["id", "created_at", "updated_at"]
