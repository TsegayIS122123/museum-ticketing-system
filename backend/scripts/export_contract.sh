#!/usr/bin/env bash
# Regenerates ../contracts/openapi.yaml (repo root) from the actual Django
# views/serializers. Run this after any change to a serializer, view, or
# urls.py, then commit the diff -- that commit IS the contract change the
# frontend side of this repo should pick up (run
# frontend/scripts/generate-types.sh next, or `npm run generate-types`).
#
# Usage (from repo root):
#   docker compose exec api ./scripts/export_contract.sh
# or, outside Docker with the venv active (from backend/):
#   ./scripts/export_contract.sh

set -euo pipefail
python manage.py spectacular --file ../contracts/openapi.yaml --validate
echo "contracts/openapi.yaml regenerated. Review the diff, then commit it."
