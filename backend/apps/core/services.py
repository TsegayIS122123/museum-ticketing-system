"""
core -- services

Per Design Spec Sec 6.6 / NFR-AUDIT-001: `write_audit_log` is the single
entry point every other app's services.py calls to record a refund,
settlement transfer, date closure, manual attendance entry, cancellation,
or reschedule -- never written to application logs alone, and never
written to directly from a views.py (Sec 3.1: views only route to a
service call).

This module has no dependency on any other app (Sec 3.2's "core: none"
row) -- callers pass plain values (`actor_id`, `target_id` as a string),
never model instances, so this module never needs to import
`apps.accounts` or anything else to stay decoupled.
"""

from .models import AuditLogEntry


def write_audit_log(*, actor_id=None, action, target_type, target_id, metadata=None):
    """Implements NFR-AUDIT-001. `actor_id` is nullable -- the two
    automatic paths (no-response refund, system-driven sweeps) have no
    human actor. Never updated or deleted once written (Sec 1.3)."""
    return AuditLogEntry.objects.create(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        metadata=metadata or {},
    )
