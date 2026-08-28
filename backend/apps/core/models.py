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


# class BilingualTextMixin -- Sec 6.4: staff-editable text (category names,
# notice templates, booking purpose) is stored as a parallel English/Amharic
# column pair. Add a reusable abstract mixin here once the first app needs it
# (see Document 05 for the exact field-naming convention, e.g. name_en/name_am).
