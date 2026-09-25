from rest_framework import serializers

from .models import Institution


class InstitutionSerializer(serializers.ModelSerializer):
    """`Institution` (UAT round 1). Read-only -- there is no
    create/update endpoint for this model at all; every write goes
    through `services.resolve_institution`, called only from
    `apps.bookings.services.create_booking`'s group path."""

    name = serializers.CharField(read_only=True)
    nameAm = serializers.CharField(source="name_am", read_only=True, allow_null=True)
    tin = serializers.CharField(read_only=True)

    class Meta:
        model = Institution
        fields = ["id", "name", "nameAm", "tin"]
