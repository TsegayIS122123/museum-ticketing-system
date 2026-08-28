#!/usr/bin/env bash
# Regenerates TypeScript types from the contract.
#
# Historically (when frontend/backend were separate repos) this script
# curled contracts/openapi.yaml from the backend repo's default branch.
# Now that both live in this one repo, "syncing" is just "the file at
# ../contracts/openapi.yaml is already current" -- so this is a thin
# wrapper around generate-types.sh, kept under the same script name so
# `npm run sync-contract` and any existing CI step keep working unchanged.
#
# If contracts/openapi.yaml itself is stale, someone needs to run
# backend/scripts/export_contract.sh first (or pull latest on this repo).

set -euo pipefail
./scripts/generate-types.sh
