from django.contrib import admin

from .models import Refund


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "booking",
        "reason",
        "status",
        "amount_etb",
        "aggregator_fee_etb",
        "chapa_refund_reference",
        "created_at",
    )
    list_filter = ("reason", "status")
    search_fields = ("id__exact", "booking__reference", "chapa_refund_reference")
    readonly_fields = [f.name for f in Refund._meta.fields]
