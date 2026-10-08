"""
Request/response shape and field-level validation only (Design Spec Sec 3.1).
Delegates to services.py for anything stateful.

The response shape (`UserProfile`, Document 04) is intentionally *not*
redeclared here: Staff and Visitor accounts share one representation, and
`apps.accounts.serializers.AccountSerializer` already owns it -- views.py
imports that directly rather than this module defining a parallel
`StaffSerializer` that could drift from it.
"""

from rest_framework import serializers

from apps.accounts.models import Account
from apps.core.models import AuditLogEntry

from .services import PROVISIONABLE_ROLES

# A distinct (value, label) choice set from Account.Role's own four-way
# enum (used by AccountSerializer's model-driven `role` field) -- both are
# fields literally named `role`, so without ENUM_NAME_OVERRIDES pointing
# at this exact object (config/settings/base.py `SPECTACULAR_SETTINGS`),
# schema generation can't tell them apart and falls back to an
# auto-numbered name (e.g. "Role222Enum").
STAFF_ROLE_CHOICES = tuple((role, Account.Role(role).label) for role in sorted(PROVISIONABLE_ROLES))


class StaffCreateSerializer(serializers.Serializer):
    """`StaffCreateRequest` (Document 04) -- FR-ACC-002, Platform Admin
    only. No `password` field: services.create_staff_account provisions
    the account with no usable password and sends a set-password link
    instead (FR-ACC-006's flow, reused)."""

    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    full_name = serializers.CharField(max_length=255)
    role = serializers.ChoiceField(choices=STAFF_ROLE_CHOICES)


class StaffUpdateSerializer(serializers.Serializer):
    """`StaffUpdateRequest` (Document 04) -- FR-ACC-002, Platform Admin
    only. Every field optional so a single `PUT` can update the staff
    profile and role without changing the password."""

    email = serializers.EmailField(required=False)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, allow_null=True)
    full_name = serializers.CharField(max_length=255, required=False)
    role = serializers.ChoiceField(choices=STAFF_ROLE_CHOICES, required=False)
    active = serializers.BooleanField(required=False)


class AuditLogEntrySerializer(serializers.ModelSerializer):
    """`AuditLogEntry` (Document 04) -- one append-only row of the platform
    audit trail (FR-AUDIT-001). Read-only: entries are written by
    `core.services.write_audit_log` throughout the codebase, never through
    the API."""

    actorUserId = serializers.UUIDField(source="actor_id", read_only=True, allow_null=True)
    entityType = serializers.CharField(source="target_type", read_only=True)
    entityId = serializers.CharField(source="target_id", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "actorUserId",
            "action",
            "entityType",
            "entityId",
            "metadata",
            "createdAt",
        ]
        read_only_fields = fields
