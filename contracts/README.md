# contracts/openapi.yaml

This file is **generated**, not hand-written. Run `backend/scripts/export_contract.sh`
after changing any serializer, view, or urls.py in `backend/`, then commit
the result.

Until the real endpoints exist, this starts as a copy of `docs/04-openapi-
specification.yaml` (the hand-authored spec from the design phase). As each
backend app's views/serializers get built, regenerate this file and it
will start reflecting the real API instead of the hand-written draft — at
that point `docs/04-openapi-specification.yaml` becomes historical/
reference only.

Both sides of this repo build against this one file:

- `backend/` regenerates it from the live Django schema.
- `frontend/` generates `src/lib/api-types.ts` from it
  (`frontend/scripts/generate-types.sh`) and can serve it as a local mock
  API via Prism (`docker compose --profile mock up mock-api`).

Living in one repo means there's no "sync" step across a repo boundary —
just keep the regenerate-and-commit habit on the backend side, and re-run
`generate-types.sh` on the frontend side after.
