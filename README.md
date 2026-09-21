# Museum Ticketing & Booking Platform

Bilingual (Amharic/English) online booking, payment, and gate check-in for
the Zoological Natural History Museum's digital ticketing track — additive to the museum's
existing counter process. See `docs/01-product-overview.md` for the full
product context.

This is a single repo containing both halves of the project:

```
backend/      Django + DRF modular monolith (see backend/README.md)
frontend/     Next.js app -- Visitor site + Staff dashboard (see frontend/README.md)
contracts/    openapi.yaml -- the API contract both sides build against
docs/         Full spec doc set (product overview through deployment/devops)
docker-compose.yml   the one dev stack for everything above
```

Both `backend/` and `frontend/` were originally scaffolded as if they'd be
separate repos (each with its own `docker-compose.yml`, its own copy of
`contracts/` and `docs/`, and a frontend "sync from a remote URL" script).
That's been collapsed here into one repo: one `docker-compose.yml`, one
`contracts/`, one `docs/`, and in-repo scripts instead of a network sync
step. `backend/README.md` and `frontend/README.md` still cover
area-specific detail (build order, per-app stack, design tokens, etc).

**This is a scaffold only** — folder structure, config, and stubs with
comments pointing at the requirement/design-doc sections that justify
them, but no models, endpoints, screens, or business logic implemented yet.

## First-time setup

```bash
cp backend/.env.example backend/.env
# set a real SECRET_KEY in backend/.env:
python -c "import secrets; print(secrets.token_urlsafe(50))"

cp frontend/.env.example frontend/.env.local

docker compose up --build
```

This brings up the whole stack: `db`, `redis` (backend dependencies), `api`,
`worker`, `beat` (backend), and `web` (frontend) — `web` talks to the real
`api` by default. Object storage (MinIO/S3) is currently disabled — see
"Object storage" below.

Then, in a second terminal:

```bash
docker compose exec api python manage.py migrate
docker compose exec api python manage.py createsuperuser
```

- API: http://localhost:8000 (schema at `/api/schema/swagger-ui/`)
- Web: http://localhost:3000

### Object storage

Receipts and other uploads currently use local filesystem storage
(`backend/media/`) — S3-compatible object storage (MinIO or a paid managed
S3 account, per ADR-005) is deferred until it's actually available. To
bring it back later: uncomment the `minio` service in `docker-compose.yml`,
the S3 settings in `backend/config/settings/base.py`, and
`django-storages[s3]` in `backend/requirements/base.txt` — no other code
changes needed, since every app only calls Django's storage API.

### Frontend-only mode

To work on the UI without the full Django/Postgres/Celery/MinIO stack,
use the optional Prism mock (reads `contracts/openapi.yaml`) instead of
the real API:

```bash
docker compose --profile mock up mock-api
NEXT_PUBLIC_API_URL=http://localhost:4010 docker compose up web
```

## The contract

`contracts/openapi.yaml` is generated from the real Django API (once it
exists) via `backend/scripts/export_contract.sh`, and consumed by
`frontend/` for both its TypeScript types (`frontend/scripts/generate-
types.sh`) and its local mock server. It starts as a copy of the
hand-authored `docs/04-openapi-specification.yaml`. Since everything is
one repo, there's no cross-repo sync step — regenerate on the backend
side, then regenerate types on the frontend side, and commit both.

## Where to go next

- `backend/README.md` — Django app layout, module-to-requirement mapping,
  build order.
- `frontend/README.md` — Next.js layout, design-token build order, feature
  folder mapping.
- `docs/03-software-design-specification.md` — overall architecture (both
  sides), ADRs.
