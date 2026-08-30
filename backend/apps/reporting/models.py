"""
reporting -- models

Implements FR modules: FR-REPORT
Depends on: bookings, payments, settlement

Deliberately empty. Per Document 05 Sec 7 ("FR-REPORT-001 - FR-REPORT-003 |
Derived from `booking`, `payment`, `cashier_reconciliation` (no dedicated
table -- see Document 03 Sec 3.2, the `reporting` app is a query layer
only)"): this module has no tables of its own. Every figure it surfaces
(revenue, visitor counts, status mix, per-cashier settlement position) is
computed on demand from rows owned by `apps.bookings`, `apps.payments`,
and `apps.settlement` -- see services.py for the actual queries.

This is not an oversight to "fill in later": adding a model here would
mean duplicating/denormalizing data another app already owns as the
system of record, which is exactly what Document 05's note above rules
out.
"""
