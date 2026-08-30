"""
Read-mostly support/debugging view for Platform Admin (mirrors
payments.admin/refunds.admin/bookings.admin). A `CashierReconciliation`
row's lifecycle is entirely services.py-governed (initiate_reconciliation,
confirm_reconciliation_success/_failure), so every field is read-only
here.
"""

from django.contrib import admin

from .models import CashierReconciliation


@admin.register(CashierReconciliation)
class CashierReconciliationAdmin(admin.ModelAdmin):
    ordering = ["-created_at"]
    list_display = [
        "id",
        "cashier",
        "amount_etb",
        "status",
        "chapa_transfer_reference",
        "initiated_at",
        "completed_at",
        "created_at",
    ]
    list_filter = ["status"]
    search_fields = ["id__exact", "cashier__email", "chapa_transfer_reference"]
    readonly_fields = [f.name for f in CashierReconciliation._meta.fields]

    def has_add_permission(self, request):
        # Reconciliations are only ever created by
        # services.initiate_reconciliation (Sec 3.1) -- never by hand
        # through the admin.
        return False
