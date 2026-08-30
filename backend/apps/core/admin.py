"""
core -- admin

Read-only view of the append-only audit trail (NFR-AUDIT-001, see
models.py). Rows are written exclusively by apps.core.services.write_audit_log
from other apps' services.py -- never by hand, so add/change/delete are all
disabled here; this is strictly a support/debugging view for Platform Admin.
"""

from django.contrib import admin

from .models import AuditLogEntry


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    ordering = ["-created_at"]
    list_display = ["created_at", "action", "actor_id", "target_type", "target_id"]
    list_filter = ["action", "target_type"]
    search_fields = ["actor_id", "target_id", "action"]
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in AuditLogEntry._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False