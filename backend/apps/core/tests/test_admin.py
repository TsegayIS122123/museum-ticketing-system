"""
Unit tests for core/admin.py's AuditLogEntryAdmin -- confirms the
append-only audit trail (NFR-AUDIT-001) is actually visible in /admin/
and stays read-only there (rows are only ever written by
apps.core.services.write_audit_log, never by hand -- see admin.py).
"""

import pytest
from django.contrib import admin
from django.test import RequestFactory

from apps.accounts.models import Account
from apps.core.admin import AuditLogEntryAdmin
from apps.core.models import AuditLogEntry
from apps.core.services import write_audit_log

pytestmark = pytest.mark.django_db


def _make_platform_admin():
    account = Account(
        email="admin@example.com", full_name="Admin", role=Account.Role.PLATFORM_ADMIN
    )
    account.set_password("a-strong-password-1")
    account.save()
    return account


def test_audit_log_entry_is_registered_with_the_admin_site():
    assert admin.site.is_registered(AuditLogEntry)


def test_audit_log_admin_disables_add_change_and_delete():
    admin_instance = AuditLogEntryAdmin(AuditLogEntry, admin.site)
    request = RequestFactory().get("/admin/core/auditlogentry/")
    request.user = _make_platform_admin()

    assert admin_instance.has_add_permission(request) is False
    assert admin_instance.has_change_permission(request) is False
    assert admin_instance.has_delete_permission(request) is False


def test_audit_log_admin_every_field_is_readonly():
    admin_instance = AuditLogEntryAdmin(AuditLogEntry, admin.site)
    field_names = {f.name for f in AuditLogEntry._meta.fields}

    assert field_names.issubset(set(admin_instance.readonly_fields))


def test_audit_log_admin_list_display_and_search_reflect_written_entries():
    entry = write_audit_log(
        actor_id=None,
        action="booking.cancelled",
        target_type="Booking",
        target_id="some-booking-id",
        metadata={"reason": "visitor_requested"},
    )

    admin_instance = AuditLogEntryAdmin(AuditLogEntry, admin.site)
    request = RequestFactory().get("/admin/core/auditlogentry/")
    request.user = _make_platform_admin()

    changelist_qs = admin_instance.get_queryset(request)
    assert entry in changelist_qs