# Reference documents

This project's reference copy of the full spec set (product overview
through deployment/devops), shared by both `backend/` and `frontend/`.
These are the authoritative source for every FR/NFR/ADR referenced in code
comments throughout the repo.

`04-openapi-specification.yaml` is the hand-authored starting point for
`../contracts/openapi.yaml` — once real views/serializers exist, regenerate
the contract (`backend/scripts/export_contract.sh`) and this file becomes
historical/reference only.
