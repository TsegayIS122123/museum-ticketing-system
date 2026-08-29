from django.contrib import admin

from .models import Notification, NotificationDelivery


class NotificationDeliveryInline(admin.TabularInline):
    model = NotificationDelivery
    extra = 0
    readonly_fields = ["id", "channel", "status", "sent_at", "error_message", "created_at"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        # Deliveries are only ever created by services.record_notification
        # (Sec 3.1) -- never by hand in the admin.
        return False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["id", "notification_type", "account", "booking", "created_at"]
    list_filter = ["notification_type"]
    search_fields = ["account__email", "booking__reference"]
    readonly_fields = ["id", "account", "booking", "notification_type", "created_at"]
    inlines = [NotificationDeliveryInline]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        # Notifications are only ever created by services.record_notification
        # (Sec 3.1) -- never by hand in the admin.
        return False


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    list_display = ["id", "notification", "channel", "status", "sent_at", "created_at"]
    list_filter = ["channel", "status"]
    readonly_fields = [
        "id",
        "notification",
        "channel",
        "status",
        "sent_at",
        "error_message",
        "created_at",
    ]

    def has_add_permission(self, request):
        return False
