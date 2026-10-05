# Document 04a — API changes since Document 04

**Status:** companion to `04-openapi-specification.yaml`, which is now historical. The implemented API is `contracts/openapi.yaml`, generated from the real views and serializers (`backend/scripts/export_contract.sh`) and checked for drift in CI. This page records, in prose, where the implemented API differs from Document 04, so a reader of 04 isn't misled. When in doubt, the contract wins.

## Decisions reflected in the current contract

- **Mobile auth (`X-Client-Platform`).** `POST /auth/login/`, `POST /auth/visitor/verify/confirm/`, and `POST /auth/refresh/` accept the optional header. With `expo`, the refresh token is returned in the response body and accepted in the refresh request body; otherwise it is an HttpOnly cookie only (Document 03, ADR-013).
- **Audit log.** `GET /admin/audit-log/` returns a paginated, filterable, read-only trail for Platform Admin (FR-AUDIT-001).
- **Push notifications.** `GET`/`PUT /notifications/preferences/` manage channels and language (FR-NOTIFY-PREF-001), and `POST`/`DELETE /notifications/devices/` register and deactivate device tokens (FR-NOTIFY-PUSH-001).
- **QR codes.** Tickets carry a client-rendered QR whose payload is the bare booking reference; there is no server-side QR endpoint, because both the web and mobile clients render it (FR-QR-001, FR-QR-002).
- **Booking reference format.** References are 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, matching `^[A-HJ-NP-Z2-9]{8}$`; the contract now documents this on `Booking.reference`.

## Conventions that differ from Document 04

- Implemented paths end with a trailing slash (`/api/v1/bookings/{id}/`); Document 04 omits it.
- A few operations have generated `operationId`s (e.g. `v1_bookings_items_create`) rather than hand-picked names; they are stable but not pretty.
- `GET /health` in Document 04 is implemented as two probes outside `/api/v1`, not in the contract: `GET /healthz` (liveness) and `GET /readyz` (readiness; `503` with per-dependency detail). See Document 08 §5.3.
- The live schema (`/api/schema/`, Swagger UI) is served only when `DEBUG` is on or `ENABLE_API_DOCS=true`.

## In Document 04 but implemented differently

| Document 04 | Implemented as |
|---|---|
| `POST /bookings/{id}/approval` | No such endpoint exists. Group bookings are paid for up front like individual ones; there is no approval step. |
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

## Keeping the contract and Document 04 in step

`contracts/openapi.yaml` is generated, never hand-edited. After any change to a serializer, view, or `urls.py`:

1. Run `backend/scripts/export_contract.sh` (from the repo root: `docker compose exec api ./scripts/export_contract.sh`). It regenerates `contracts/openapi.yaml` from the live Django schema and validates it before writing.
2. Commit the regenerated contract together with the code change that produced it.
3. Regenerate the client types: `frontend/scripts/generate-types.sh` (or `npm run generate-types`) and the mobile equivalent.

`docs/04-openapi-specification.yaml` is deliberately **not** regenerated and is not kept in sync; it stays as the historical hand-authored spec. This page (04a) is the written record of where the implemented API differs, so update it when a divergence is intentional rather than a drift the contract should already reflect.
