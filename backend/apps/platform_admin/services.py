"""
platform_admin -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Implements the staff-facing part of FR-ACC-002: Platform-Admin-only
provisioning, editing, and deactivation of Cashier / Museum Manager
accounts. There is no `platform_admin`-owned model -- this app reaches
into `apps.accounts.Account` directly (Document 05 Sec 3.1: one table
serves every role) rather than introducing a parallel "staff" table.

Authorization (Platform-Admin-only, FR-ACC-002) is the view layer's job
(`core.permissions.IsPlatformAdmin`), not this module's -- services
assume the caller has already been authorized, mirroring every other
app's own division of labor (see accounts/services.py, catalog/services.py).

A Platform Admin's own account is out of scope for every function here:
FR-ACC-002 only ever describes the Platform Admin provisioning *Cashier
and Museum Manager* accounts, never another Platform Admin account, so
`update_staff_account`/`deactivate_staff_account` refuse to touch one --
that path stays `manage.py createsuperuser`-only (accounts/models.py).
"""

from uuid import UUID

from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.core.exceptions import Conflict
from apps.core.models import AuditLogEntry
from apps.core.services import write_audit_log

# Document 04's StaffCreateRequest/StaffUpdateRequest `role` enum -- a
# Platform Admin provisions or edits a Cashier or Museum Manager only.
PROVISIONABLE_ROLES = {Account.Role.CASHIER, Account.Role.MUSEUM_MANAGER}

_NOT_A_STAFF_ACCOUNT_ROLE = {"role": f"Must be one of {sorted(PROVISIONABLE_ROLES)}."}
_PLATFORM_ADMIN_OUT_OF_SCOPE = (
    "A Platform Admin account can't be managed through this endpoint."
)


def list_staff():
    """Implements `GET /admin/staff` -- every Staff account (Cashier,
    Museum Manager, Platform Admin alike; Document 04's `UserProfile` list
    isn't restricted to the two provisionable roles), most-recently
    created first."""
    return Account.objects.filter(
        role__in={
            Account.Role.CASHIER,
            Account.Role.MUSEUM_MANAGER,
            Account.Role.PLATFORM_ADMIN,
        }
    ).order_by("-created_at")


def create_staff_account(*, actor, email, full_name, role, phone=""):
    """Implements FR-ACC-002's provisioning path (`POST /admin/staff`).

    `StaffCreateRequest` (Document 04) never carries a password -- the new
    row starts with no usable password, exactly like a fresh Visitor row
    (accounts/models.py `AccountManager._create`), and is immediately sent
    the same password-reset link a Staff member who forgot their password
    gets (FR-ACC-006's existing flow, reused here rather than duplicated)
    so the new Cashier or Museum Manager sets their own initial password
    and the Platform Admin never sees or chooses one.
    """
    if role not in PROVISIONABLE_ROLES:
        raise ValidationError(_NOT_A_STAFF_ACCOUNT_ROLE)

    email = Account.objects.normalize_email(email)
    if Account.objects.filter(email=email).exists():
        raise Conflict("An account with this email already exists.")
    if phone and Account.objects.filter(phone=phone).exists():
        raise Conflict("An account with this phone number already exists.")

    account = Account(
        email=email,
        phone=phone or None,
        full_name=full_name,
        role=role,
    )
    account.set_unusable_password()
    account.save()

    write_audit_log(
        actor_id=actor.id,
        action="staff.created",
        target_type="account",
        target_id=account.id,
        metadata={"role": role},
    )

    # Imported here, not at module load, so tests can patch
    # apps.accounts.services.request_password_reset directly (mirrors
    # accounts/services.py's own lazy import of send_notification, for
    # the same reason). FR-ACC-006's flow, not a new one: sends the same
    # "set/reset your password" email a Staff member requests themselves,
    # so the new account's very first password is chosen by its owner.
    from apps.accounts.services import request_password_reset

    request_password_reset(email=account.email)

    return account


_UNSET = object()


def update_staff_account(
    *, actor, account, email=_UNSET, phone=_UNSET, full_name=_UNSET, role=None, active=None
):
    """Implements FR-ACC-002's edit path (`PUT /admin/staff/{id}`) -- a
    Platform Admin may edit the staff profile, reassign a role, or flip
    the `active` flag. Changing email or phone invalidates an outstanding
    password-reset token without creating a replacement."""
    if account.role == Account.Role.PLATFORM_ADMIN:
        raise ValidationError(_PLATFORM_ADMIN_OUT_OF_SCOPE)

    if role is not None and role not in PROVISIONABLE_ROLES:
        raise ValidationError(_NOT_A_STAFF_ACCOUNT_ROLE)

    changes = {}
    contact_changed = False
    if email is not _UNSET:
        normalized_email = Account.objects.normalize_email(email)
        if Account.objects.exclude(pk=account.pk).filter(email=normalized_email).exists():
            raise Conflict("An account with this email already exists.")
        if normalized_email != account.email:
            account.email = normalized_email
            changes["email"] = normalized_email
            contact_changed = True
    if phone is not _UNSET:
        normalized_phone = phone or None
        if normalized_phone and Account.objects.exclude(pk=account.pk).filter(phone=normalized_phone).exists():
            raise Conflict("An account with this phone number already exists.")
        if normalized_phone != account.phone:
            account.phone = normalized_phone
            changes["phone"] = normalized_phone
            contact_changed = True
    if full_name is not _UNSET and full_name != account.full_name:
        account.full_name = full_name
        changes["full_name"] = full_name
    if role is not None and role != account.role:
        changes["role"] = role
        account.role = role
    if active is not None and active != account.active:
        changes["active"] = active
        account.active = active
        if not active:
            # ADR-002: deactivating a Staff account should invalidate any
            # access token already issued to them immediately, not merely
            # block their next login attempt (mirrors accounts.services'
            # own use of `token_version` on a Staff password reset).
            account.token_version += 1

    if contact_changed:
        account.password_reset_token_hash = None
        account.password_reset_expires_at = None
        changes["password_reset_token_invalidated"] = True

    if changes:
        account.save()
        write_audit_log(
            actor_id=actor.id,
            action="staff.updated",
            target_type="account",
            target_id=account.id,
            metadata=changes,
        )

    return account


def deactivate_staff_account(*, actor, account):
    """Implements FR-ACC-002's removal path (`DELETE /admin/staff/{id}`).
    Document 05 Sec 1.3: never a physical delete -- only `active=False`,
    since the account may already be `approved_by_user_id` or
    `checked_in_by_user_id` on historical bookings (mirrors category
    retirement, catalog/services.retire_category). Idempotent: deactivating
    an already-inactive account is a no-op, not an error."""
    if account.role == Account.Role.PLATFORM_ADMIN:
        raise ValidationError(_PLATFORM_ADMIN_OUT_OF_SCOPE)

    if account.active:
        account.active = False
        account.token_version += 1
        account.save(update_fields=["active", "token_version", "updated_at"])
        write_audit_log(
            actor_id=actor.id,
            action="staff.deactivated",
            target_type="account",
            target_id=account.id,
            metadata={},
        )

    return account


def list_audit_log(
    *,
    actor=None,
    action=None,
    entity_type=None,
    entity_id=None,
    date_from=None,
    date_to=None,
):
    """Implements `GET /admin/audit-log` -- FR-AUDIT-001, Platform Admin
    only. Read-only, append-only: this is a straight query over
    `core.AuditLogEntry`, the same rows every module writes via
    `core.services.write_audit_log`; nothing here ever creates or edits an
    entry. Most-recent first, since the trail is only ever scanned from
    the top for a recent incident.

    `entity_type`/`entity_id` map onto `AuditLogEntry.target_type`/
    `target_id` (Document 05's audit table predates the "entity"
    vocabulary used in the API's query params -- same columns, different
    label). Bad `actor`/date values are treated as an empty match rather
    than a 500: the querysets simply ignore unparseable input so a
    mistyped filter degrades to "no results", not a crash.
    """
    queryset = AuditLogEntry.objects.all().order_by("-created_at")

    if actor:
        try:
            actor_id = UUID(str(actor))
        except ValueError:
            return queryset.none()
        queryset = queryset.filter(actor_id=actor_id)
    if action:
        queryset = queryset.filter(action=action)
    if entity_type:
        queryset = queryset.filter(target_type=entity_type)
    if entity_id:
        queryset = queryset.filter(target_id=entity_id)

    parsed_from = parse_datetime(date_from) if date_from else None
    if parsed_from is not None:
        queryset = queryset.filter(created_at__gte=parsed_from)
    parsed_to = parse_datetime(date_to) if date_to else None
    if parsed_to is not None:
        queryset = queryset.filter(created_at__lte=parsed_to)

    return queryset
