# ZNHM Ticketing — Mobile

The native iOS/Android client of **ZNHM Ticketing**, built with Expo / React
Native for all four roles: `visitor`, `cashier`, `museum_manager`, and
`platform_admin`. The app is a client of the same Django REST API as the web
app; it has no backend of its own and no source-of-truth database of its own.

Full design detail lives in `../docs/09-mobile-app-design.md`.

- App: **ZNHM Ticketing** (short form **ZNHM**)
- Bundle / package ID: `et.aau.znhm.ticketing`
- URL scheme: `znhm`
- Brand blue: `#015484`

## Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env
npx expo start
```

`EXPO_PUBLIC_API_URL` must point at the API and **include the `/api/v1`
prefix** (for example `http://192.168.1.10:8000/api/v1`). On a physical device
it must be a LAN address, not `localhost`, because the device cannot reach
your machine's loopback interface.

## Regenerating API types

After `../contracts/openapi.yaml` changes, regenerate the TypeScript schema:

```bash
npm run types:api
```

This writes `src/api/generated/schema.d.ts`, which is generated output and
must not be hand-edited. Under the hood it runs:

```bash
npx openapi-typescript ../contracts/openapi.yaml -o src/api/generated/schema.d.ts
```

## Role routing

After sign-in the app reads the current account and routes to the experience
for its role:

| `account.role` | Route group | Experience |
|---|---|---|
| `visitor` | `(visitor)` | Verify, browse, book, pay, ticket + QR, cancel/reschedule, refund request, profile |
| `cashier` | `(cashier)` | Gate lookup (typed or camera-scanned), check-in, mismatch flagging, IFMIS voucher, reconciliation |
| `museum_manager` | `(manager)` | Dashboard, categories, availability, booking oversight and correction, reports |
| `platform_admin` | `(admin)` | Staff administration, audit log, reports |

Client-side guards are UX only; authorization is enforced server-side on every
request, and an unknown role returns the user to sign-in.

## Environment

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL, including `/api/v1`. Required. |
