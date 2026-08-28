"""
core -- models (shared kernel)

Per Design Spec Sec 6.6 / NFR-AUDIT-001: every refund, settlement transfer,
date closure, manual attendance entry, and cancellation/reschedule is
written to this append-only audit_log table -- never to application logs
alone. Written to by services.py in other apps, never by views.py directly.

Per ADR-004: single-venue system, no organization/tenant FK anywhere.

See Document 05 Sec 3.7 for the authoritative column list.
"""

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLogEntry(TimeStampedModel):
    """Append-only audit trail (NFR-AUDIT-001). Never updated or deleted
    once written -- see Document 08 Sec 10 (retention operations)."""

    actor_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100)
    target_id = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        app_label = "core"
        indexes = [models.Index(fields=["target_type", "target_id"])]


class BilingualNameMixin(models.Model):
    """Sec 6.4 / FR-LOC-004: any staff-editable "name" column is a parallel
    English/Amharic pair, each independently maintained -- never
    machine-translated from the other. First consumer: `apps.catalog.Category`
    (Document 05 Sec 3.2's `name_en`/`name_am`). A model with a
    differently-named bilingual pair (e.g. `settlement_transfer`'s
    `purpose_en`/`purpose_am`) declares its own fields instead of using this
    mixin -- the naming convention is the point, not a shared field name.
    """

    name_en = models.TextField()
    name_am = models.TextField()

    class Meta:
        abstract = True
