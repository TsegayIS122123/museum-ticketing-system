# ZNHM Ticketing

Bilingual (Amharic/English) online booking, payment, and gate check-in for the
**Zoological Natural History Museum (ZNHM)**, AAU CNCS, 4 Killo, Addis Ababa.

ZNHM Ticketing is the museum's unified digital ticketing platform. Visitors
browse categories and dates, book and pay online, and receive a ticket with a
real QR code; Cashiers look a booking up at the gate and record attendance;
Museum Managers control dates, categories, and reporting; Platform Admins
manage staff and review the audit trail. Every role works against one API and
one source of truth. See `docs/01-product-overview.md` for the full product
context.

- App: **ZNHM Ticketing** (short form **ZNHM**)
- Bundle / package ID: `et.aau.znhm.ticketing`
- URL scheme: `znhm`
- Brand blue: `#015484`
- Roles: `visitor`, `cashier`, `museum_manager`, `platform_admin`
- Languages: Amharic (`am`) and English (`en`)

## Clients

- **Web** (`frontend/`) — the public Visitor site (Next.js, SSR) and the Staff
  dashboard (CSR under `/staff/*`), in one deployable.
- **Mobile** (`mobile/`) — a native iOS/Android client (Expo / React Native)
  for all four roles, routed by role after login.
- **API** (`backend/`) — the Django + DRF modular monolith both clients build
  against.

## Repository layout

```
backend/           Django + DRF API, worker, and scheduler (see backend/README.md)
frontend/          Next.js Visitor site + Staff dashboard (see frontend/README.md)
mobile/            Expo / React Native four-role app (see mobile/README.md)
contracts/         openapi.yaml -- the authoritative API contract
docs/              Product, requirements, design, database, UI/UX, QA, and ops docs
docker-compose.yml the dev stack for backend/ and frontend/
```

## Getting started

The full, command-level detail lives in each client's README:

- `backend/README.md` — Django setup, build order, and the contract export.
- `frontend/README.md` — Next.js setup, design tokens, and type generation.
- `mobile/README.md` — Expo setup, environment configuration, and type generation.

At a glance, bring the whole backend + web stack up from the repo root:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up --build
```

Then run migrations and create an admin account:

```bash
docker compose exec api python manage.py migrate
docker compose exec api python manage.py createsuperuser
```

- API: http://localhost:8000 (schema at `/api/schema/swagger-ui/`)
- Web: http://localhost:3000

## The contract

`contracts/openapi.yaml` is generated from the real Django API via
`backend/scripts/export_contract.sh` and consumed by `frontend/` and `mobile/`
for their TypeScript types. It is the authoritative description of every
endpoint; both clients regenerate from it after a backend change.

## Documentation index

One-line descriptions of each document live in [`docs/README.md`](docs/README.md).
In short:

- **01 Product Overview** — vision, roles, journey, and scope.
- **02 SRS** — functional and non-functional requirements.
- **03 SDS** — architecture, modules, authentication, and ADRs.
- **04 API Specification** — the historical hand-authored spec (the contract wins).
- **04a API changes** — how the implemented API differs from Document 04.
- **05 Database Design** — table-level schema.
- **06 UI/UX Specification** — screens, design system, and flows.
- **07 Testing and QA** — strategy, test cases, and coverage gates.
- **08 Deployment and DevOps** — environments, pipeline, and operations.
- **09 Mobile Application Design** — the four-role native client.
