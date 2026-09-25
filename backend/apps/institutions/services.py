"""
institutions -- services

Business logic only (Design Spec Sec 3.1). Authorization is the view
layer's job, mirroring every other app's services.py -- `resolve_institution`
below assumes the caller (apps.bookings.services.create_booking's group
path) has already confirmed the booking itself is allowed to proceed;
this module only enforces TIN format and the resolve-or-create rule.
"""

import re

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.core.services import write_audit_log

from .models import Institution

# Section 8's TIN decision: exactly 10 digits, leading zeros preserved.
TIN_LENGTH = 10


def normalize_tin(raw_tin):
    """The single place TIN normalization/validation happens -- every
    other function in this module, and `apps.bookings.services.
    create_booking`'s group path, calls this rather than re-deriving the
    rule. Strips whitespace and hyphens a booker might type (e.g.
    "0009-001580" or "0009 001580"), then requires exactly `TIN_LENGTH`
    digits; anything else is a 400, not silently truncated or padded --
    an under/over-length TIN is far more likely a typo than a format
    this office should guess at.
    """
    if raw_tin is None:
        raise ValidationError({"tin": "TIN is required."})
    cleaned = re.sub(r"[\s\-]", "", str(raw_tin))
    if not re.fullmatch(r"\d{%d}" % TIN_LENGTH, cleaned):
        raise ValidationError({"tin": f"TIN must be exactly {TIN_LENGTH} digits."})
    return cleaned


def find_institution_by_tin(*, tin):
    """Implements `GET /institutions/?tin=...` -- the frontend's autofill
    lookup as a booker types a TIN that matches an institution already on
    file (UAT round 1). Returns `None` for an unrecognized TIN (a new
    institution, not an error) rather than raising -- unlike
    `resolve_institution` below, this never creates a row; it's a pure
    lookup for the form to react to."""
    normalized = normalize_tin(tin)
    return Institution.objects.filter(tin=normalized).first()


@transaction.atomic
def resolve_institution(*, name, tin, name_am=None, actor=None):
    """Called from `apps.bookings.services.create_booking`'s group path,
    once per group booking, and nowhere else that mutates this model
    outside tests/Django Admin/the one-off backfill data migration.

    Looks up an `Institution` by normalized `tin`; creates one, from the
    name/TIN this booking supplied, if none exists yet. A group booking
    without a TIN never reaches this function at all -- `create_booking`
    already rejects a group booking with no `groupTin` before calling
    this (Section 8: mandatory for all institutions) -- so every call
    here has a real TIN to resolve.

    Section 8's decision #3 (name mismatch on an existing TIN): the
    booker's freshly-typed name wins, not the one already on file --
    corrects a school's own typo or a legitimate rename without needing
    the Museum Manager to intervene -- but it is never silent: the
    change is written to the audit log (NFR-AUDIT-001) with both the old
    and new name, so a Manager reviewing later can see exactly what
    changed and when. `name_am` is filled in only if the institution
    doesn't already have one -- unlike `name`, a booker supplying no
    Amharic name at all should never blank out one that's already on
    file.
    """
    normalized_tin = normalize_tin(tin)
    institution, created = Institution.objects.select_for_update().get_or_create(
        tin=normalized_tin,
        defaults={
            "name": name,
            "name_am": name_am or None,
            "created_by_user_id": actor,
        },
    )
    if not created and institution.name != name:
        old_name = institution.name
        institution.name = name
        update_fields = ["name", "updated_at"]
        if name_am and not institution.name_am:
            institution.name_am = name_am
            update_fields.append("name_am")
        institution.save(update_fields=update_fields)
        write_audit_log(
            actor_id=actor.id if actor else None,
            action="institution.name_corrected",
            target_type="institution",
            target_id=institution.id,
            metadata={"old_name": old_name, "new_name": name, "tin": normalized_tin},
        )
    return institution
