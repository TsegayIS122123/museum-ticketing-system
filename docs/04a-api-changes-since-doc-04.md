# Document 04a — API changes since Document 04

**Status:** companion to `04-openapi-specification.yaml`. Document 04 is the hand-authored *starting point* for the API; the implemented API is whatever `contracts/openapi.yaml` says, because that file is generated from the real views and serializers (`backend/scripts/export_contract.sh`) and CI fails if it drifts. This page records, in prose, where the implemented API differs from Document 04, so a reader of 04 isn't misled. When in doubt, the contract wins.

## Conventions that differ from Document 04

- Implemented paths end with a trailing slash (`/api/v1/bookings/{id}/`); Document 04 omits it.
- A few operations have generated `operationId`s (e.g. `v1_bookings_items_create`) rather than hand-picked names; they are stable but not pretty.
- `GET /health` in Document 04 is implemented as two probes outside `/api/v1`, not in the contract: `GET /healthz` (liveness) and `GET /readyz` (readiness; `503` with per-dependency detail). See Document 08 §5.3.
- The live schema (`/api/schema/`, Swagger UI) is served only when `DEBUG` is on or `ENABLE_API_DOCS=true`.

## In Document 04 but implemented differently

| Document 04 | Implemented as |
|---|---|
| `POST /bookings/{id}/approval` | Not implemented. Group bookings are paid for up front like individual ones; there is no approval step. |
| `GET /settlement/pending`, `GET/… /settlement/transfers[/{id}]` | `GET /settlement/my-balance/`, `POST /settlement/reconcile/`, `GET /settlement/reconciliations/`, plus the Chapa transfer webhook (below). |

## Added since Document 04

**Gate and check-in (UAT round 1, Phases 3 and 6)**

| Method and path | Who | Purpose |
|---|---|---|
| `POST /bookings/{id}/flag-mismatch/` | Cashier | Flag a headcount/category mismatch instead of checking in; blocks check-in until a Manager corrects it. |
| `PATCH /bookings/{id}/category-correction/` | Museum Manager | Correct one item's category and/or quantity; clears the flag; issues a refund (overcharge) or opens a payment (undercharge) for the difference. |
| `PATCH /bookings/{id}/category-corrections/batch/` | Museum Manager | The same correction applied to several items with one combined delta. |
| `POST /bookings/{id}/items/` | Museum Manager | Add a category line to an existing booking. |
| `GET /bookings/{id}/ifmis-voucher/` | Cashier | Re-open the Receipt Voucher data (also returned by check-in). |
| `PATCH /bookings/{id}/ifmis-voucher/` | Cashier | Record the IFMIS *Document No* and *Ref No* keyed back in after check-in. |
| `GET /bookings/{id}/receipt/download/` | Visitor / staff | Download the temporary receipt PDF. |

**School registry (Phase 5)**

| Method and path | Purpose |
|---|---|
| `GET /institutions/?tin={tin}` | TIN autofill: returns `{"institution": …}` or `{"institution": null}`. Throttled (`institution-lookup`, 30/15m). |

**Manager reporting (Phase 7)** — Museum Manager / Platform Admin only. The range endpoints take either `preset` (`today`, `this_week`, `this_month`, `this_quarter`, `last_quarter`, `this_fiscal_year`, `last_30_days`) or explicit `from`/`to` (`YYYY-MM-DD`, inclusive, Africa/Addis_Ababa).

| Method and path | Purpose |
|---|---|
| `GET /reports/revenue/` | Gross, refunds, net, by category, individual vs institutional, and a per-period series. |
| `GET /reports/categories/` | Booked/attended/revenue per category, share of revenue, and a per-period series. |
| `GET /reports/attendance/` | Booked vs attended, shortfall, **no-shows** (`noShowBookingCount`, `noShowHeadcount`, `noShowRatePct`), correction workload. |
| `GET /reports/comparison/` | The range against the equal-length range immediately before it, with percentage deltas (`null` when there is no baseline). |
| `GET /reports/institutions/` | One row per school/institution; `sort`, `limit`, `offset`; paginated `data`/`meta` envelope. |
| `GET /reports/institutions/{id}/` | One institution's visit history in the range, including IFMIS Doc No / Ref No. |
| `GET /reports/booking-timeline/`, `GET /reports/cashier-balances/` | Forward-looking booking timeline and per-Cashier outstanding balances (Overview → "Today's operations"). Not range-scoped. |

Figures in every report count only checked-in (`Visited`) bookings by visit date; "attended" is people who actually came in, shown beside the number booked; revenue is completed payments minus completed refunds. Document 02, FR-REPORT-002, has the full definitions.

**Auth and settlement**

| Method and path | Purpose |
|---|---|
| `POST /auth/logout/` | Clears the refresh-token cookie. |
| `POST /settlement/webhook/chapa-transfer/` | Chapa transfer-status webhook (signature-verified, not for browsers). |
| `GET …/settlement/reconciliations/{id}/transfer-receipt/download/` | Transfer Receipt PDF. |

## Rate limits added in Phase 8

`otp-verify` 10/15m (OTP and magic-link verification), `password-reset-confirm` 10/15m, `institution-lookup` 30/15m, in addition to the existing `login`, `otp-request`, `password-reset-request` (5/15m each) and `booking-create` (10/15m). A throttled request returns `429`.
