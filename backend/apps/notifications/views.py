"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).

The `notifications` module has exactly two caller-scoped endpoints
(FR-NOTIFY-PUSH-001 / FR-NOTIFY-PREF-001): registering/unregistering a
push device and reading/replacing one's own notification preferences.
There is still no endpoint that *creates* a notification -- that only ever
happens via `apps.notifications.tasks.send_notification`, enqueued from
another app's services.py.
"""

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema

from . import services
from .serializers import DeviceTokenSerializer, NotificationPreferenceSerializer


class NotificationPreferenceView(generics.RetrieveUpdateAPIView):
    """GET/PUT /notifications/preferences -- the caller's own channels and
    language (FR-NOTIFY-PREF-001). `get_object` lazily creates the row so
    a first-time visitor gets the all-on defaults without an explicit
    setup call."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationPreferenceSerializer

    def get_object(self):
        return services.get_notification_preference(account=self.request.user)

    @extend_schema(tags=["Notifications"])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(tags=["Notifications"])
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)


class DeviceTokenRegisterView(generics.CreateAPIView):
    """POST /notifications/devices -- register a push destination
    (FR-NOTIFY-PUSH-001)."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DeviceTokenSerializer

    @extend_schema(tags=["Notifications"])
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = services.register_device(account=request.user, **serializer.validated_data)
        return Response(DeviceTokenSerializer(device).data, status=status.HTTP_201_CREATED)


class DeviceTokenUnregisterView(APIView):
    """DELETE /notifications/devices/{token} -- deactivate a push
    destination (FR-NOTIFY-PUSH-001). Idempotent: returns 204 whether or
    not the token was on file, and one account can never deactivate
    another's device (`services.unregister_device` scopes by owner)."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(tags=["Notifications"], request=None, responses=None)
    def delete(self, request, token):
        services.unregister_device(account=request.user, token=token)
        return Response(status=status.HTTP_204_NO_CONTENT)