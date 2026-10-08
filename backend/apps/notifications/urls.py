from django.urls import path

from . import views

app_name = "notifications"

urlpatterns = [
    path("preferences/", views.NotificationPreferenceView.as_view(), name="preferences"),
    path("devices/", views.DeviceTokenRegisterView.as_view(), name="device-register"),
    path("devices/<str:token>/", views.DeviceTokenUnregisterView.as_view(), name="device-unregister"),
]