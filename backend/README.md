# ZNHM Ticketing — Backend

Django + DRF modular monolith. See `../docs/` for the full spec.

Part of the `museum-ticketing` monorepo — `frontend/` lives alongside this
folder at the repo root, and both build against the shared `../contracts/`
and `../docs/`. There's a single root `docker-compose.yml` that brings up
this app's stack (`db`, `redis`, `api`, `worker`, `beat`) together
with `frontend/`'s `web` service — run `docker compose` from the repo
root, not from inside `backend/`.

Every app follows the same four-layer file set (`models.py` → `services.py`
→ `serializers.py` → `views.py`), and the API they expose is described in
full by `../contracts/openapi.yaml`. See the "Notable endpoints" section
below for behavior a reader should not have to reverse-engineer from the
contract.

## Stack

Django 5, DRF, PostgreSQL, JWT auth (`djangorestframework-simplejwt`),
Celery + Redis (background jobs, cache, rate limiting), `drf-spectacular`.
Local filesystem storage for uploads for now (see "Object storage" below).

Unlike a project that defers background jobs until they're needed, Celery/
Redis are wired in from day one here (ADR-003) — FR-PAY-005's daily
no-show/refund jobs are core MVP behavior, not a later scaling concern.
Object storage (ADR-005/ADR-009) is deferred until a MinIO container or a
paid managed S3 account is actually available — see below.

## The contract: `../contracts/openapi.yaml`

This file is **generated from the real API**, not hand-written, once real
views/serializers exist. It starts as a copy of the hand-authored
`../docs/04-openapi-specification.yaml`. `frontend/` builds its TypeScript
types and local mock server from it — see `../contracts/README.md`.

```bash
# After changing any serializer, view, or urls.py:
docker compose exec api ./scripts/export_contract.sh
git add contracts/openapi.yaml
git commit -m "contract: describe what changed"
```

Then, on the frontend side: `npm run generate-types` (from `frontend/`).

## Notable endpoints

- **Auth.** `POST /auth/login/`, `POST /auth/visitor/verify/confirm/`, and
  `POST /auth/refresh/` accept an optional `X-Client-Platform` header. When it
  is `expo`, the refresh token is returned in the response body (and accepted
  in the refresh request body) for the mobile client; otherwise the refresh
  token is delivered as an HttpOnly cookie only. See Document 03, ADR-013.
- **Audit log.** `GET /admin/audit-log/` — read-only, filterable, paginated,
  Platform Admin only (FR-AUDIT-001).
- **Notification preferences.** `GET`/`PUT /notifications/preferences/` —
  per-account channels and language (FR-NOTIFY-PREF-001).
- **Device tokens.** `POST /notifications/devices/` and
  `DELETE /notifications/devices/{token}/` — push registration
  (FR-NOTIFY-PUSH-001).
- **QR tickets.** Tickets carry a client-rendered QR whose payload is the
  bare booking reference; there is no server-side QR endpoint (FR-QR-001).

You can also browse the live, always-current schema while `api` is running:
- Raw schema: http://localhost:8000/api/schema/
- Swagger UI: http://localhost:8000/api/schema/swagger-ui/

## First-time setup

From the repo root (not this folder):

```bash
cp backend/.env.example backend/.env
# set a real SECRET_KEY:
python -c "import secrets; print(secrets.token_urlsafe(50))"

docker compose up --build
```

In a second terminal, once containers are healthy:

```bash
docker compose exec api python manage.py migrate
docker compose exec api python manage.py createsuperuser
```

Uploads (receipts, etc.) go to `backend/media/` on local disk for now —
see the README root's "Object storage" note for how to switch to
MinIO/S3 later.

## Repository layout

```
config/             settings/ (base/development/production), urls.py, celery.py
apps/                11 apps -- see ../docs/03-software-design-specification.md
                     Sec 3.2 for the module-to-requirement mapping and
                     dependency order.
requirements/        base.txt, development.txt, production.txt
scripts/             export_contract.sh
```

(`../contracts/` and `../docs/` live at the repo root, shared with `frontend/`.)

## Build order

1. `apps/accounts` first — `AUTH_USER_MODEL = "accounts.Account"` in
   `config/settings/base.py` must be migrated before any other app's
   models, or swapping the user model later is painful.
2. Then in dependency order: `catalog` → `bookings` → `payments` →
   `entrance` → `refunds` → `settlement` → `reporting`.
   `notifications` / `platform_admin` cut across — build them alongside
   whichever app they support first.
3. Every app follows the same four-layer split (`models.py` → `services.py`
   → `serializers.py` → `views.py`) — see `../docs/03-software-design-
   specification.md` Sec 3.1.

| App | Implements | Depends on |
|---|---|---|
| `core` | Shared kernel (audit log, exceptions, permissions, throttling) | — |
| `accounts` | FR-ACC (Visitor OTP + Staff password, dual credential paths) | `core` |
| `catalog` | FR-CAT (ticket categories, date availability) | `core` |
| `bookings` | FR-BOOK | `catalog`, `accounts` |
| `payments` | FR-PAY (Chapa integration, webhook-confirmed) | `bookings` |
| `entrance` | FR-TICKET (gate check-in, headcount reconciliation) | `bookings` |
| `refunds` | FR-REFUND | `payments`, `entrance` |
| `settlement` | FR-SETTLE (per-cashier reconciliation) | `entrance`, `refunds` |
| `reporting` | FR-REPORT | `bookings`, `payments`, `settlement` |
| `notifications` | Cross-cutting (SMS/email dispatch, never sent synchronously) | `core` |
| `platform_admin` | Staff provisioning (part of FR-ACC-002, FR-CAT-002) | `accounts`, `catalog` |

## Common commands

Run from the repo root:

```bash
docker compose exec api python manage.py makemigrations <app_name>
docker compose exec api pytest
docker compose logs -f api
docker compose down          # keep volumes
docker compose down -v       # nuke the db volume too
```
