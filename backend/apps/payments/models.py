"""
payments -- models

Implements FR modules: FR-PAY
Depends on: bookings

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per Design Spec Sec 6.4: any staff-editable text (names, templates, notices)
is stored as a parallel English/Amharic column pair, not a single column
with runtime translation -- see Document 05 for the exact fields/tables.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

See Document 05 (Database Design) for the real fields/tables to implement.
"""

from django.db import models

# from apps.core.models import TimeStampedModel

# class Example(TimeStampedModel):
#     class Meta:
#         app_label = "payments"
