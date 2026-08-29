"""
platform_admin -- models

Implements FR modules: Staff-facing part of FR-ACC-002, FR-CAT-002
Depends on: accounts, catalog

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per Design Spec Sec 6.4: any staff-editable text (names, templates, notices)
is stored as a parallel English/Amharic column pair, not a single column
with runtime translation -- see Document 05 for the exact fields/tables.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

See Document 05 (Database Design) for the real fields/tables to implement.
"""


# No models here by design. The staff-facing part of FR-ACC-002 this app
# implements (provisioning, editing, and deactivating Cashier / Museum
# Manager accounts) operates entirely on `apps.accounts.Account` --
# Document 05 Sec 3.1's single table already serves every role, including
# Platform Admin's own -- so a parallel `platform_admin`-owned "staff"
# table would just duplicate it. See services.py.
#
# FR-CAT-002 (category management) is likewise fully owned by
# apps.catalog, not this app, despite the module docstring's original
# scope note -- see apps/catalog/models.py's `Category`.
