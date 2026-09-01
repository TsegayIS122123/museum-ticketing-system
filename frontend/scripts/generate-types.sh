#!/usr/bin/env bash
# Regenerates src/lib/api-types.ts from ../contracts/openapi.yaml (repo root).
# Run after backend/scripts/export_contract.sh has updated the contract, or
# after manually editing contracts/openapi.yaml ahead of a backend change.

set -euo pipefail
npx openapi-typescript ../contracts/openapi.yaml --default-non-nullable false -o src/lib/api-types.ts
echo "src/lib/api-types.ts regenerated."
