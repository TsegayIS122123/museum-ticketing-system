"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.
"""

from rest_framework import serializers

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    """`Category` (Document 04) -- FR-CAT-001. Read-only: every mutation
    goes through Create/Update below and services.py, never through this
    serializer directly."""

    class Meta:
        model = Category
        fields = ["id", "name_en", "name_am", "price_etb", "is_free", "active"]
        read_only_fields = fields


class CategoryCreateSerializer(serializers.ModelSerializer):
    """`CategoryCreateRequest` -- Museum Manager only (FR-CAT-002)."""

    class Meta:
        model = Category
        fields = ["name_en", "name_am", "price_etb", "is_free"]
        extra_kwargs = {
            "is_free": {"required": False},
            # Document 05 Sec 3.2's CHECK (price_etb >= 0), mirrored here so
            # a bad price is a 400 rather than surfacing as a raw db error.
            "price_etb": {"min_value": 0},
        }


class CategoryUpdateSerializer(serializers.ModelSerializer):
    """`CategoryUpdateRequest` -- Museum Manager only (FR-CAT-002). Every
    field is optional since a single PUT here may only be a price change,
    only a retire/reactivate (`active`), or any combination."""

    class Meta:
        model = Category
        fields = ["name_en", "name_am", "price_etb", "is_free", "active"]
        extra_kwargs = {
            "name_en": {"required": False},
            "name_am": {"required": False},
            "price_etb": {"required": False, "min_value": 0},
            "is_free": {"required": False},
            "active": {"required": False},
        }
