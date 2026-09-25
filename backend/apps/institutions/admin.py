"""
Platform Admin support/debugging only -- every real write goes through
`services.resolve_institution`, called only from a group booking. Adding
a row by hand here is left enabled for the same reason as
`apps.catalog.admin.CategoryAdmin`: there's no provisioning flow for it
to bypass.
"""

from django.contrib import admin

from .models import Institution


@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    ordering = ["name"]
    list_display = ["name", "name_am", "tin", "created_at"]
    search_fields = ["name", "name_am", "tin"]
    readonly_fields = ["id", "created_at", "updated_at"]
