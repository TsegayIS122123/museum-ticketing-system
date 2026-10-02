"""Health-check endpoints (Phase 8 / Doc 08).

* `/healthz` -- liveness: the process is up and serving. No dependencies,
  so an orchestrator restarts the container only when Django itself is
  wedged, never because Postgres had a blip.
* `/readyz`  -- readiness: Postgres and Redis both answer. Returns 503 with
  per-dependency detail so a load balancer stops routing here and an
  operator can see *which* dependency is down.

Both are plain Django views (not DRF): unauthenticated, uncached, never
throttled, and deliberately absent from the OpenAPI contract. They are
exempted from SECURE_SSL_REDIRECT in production.py, because a load
balancer's probe is plain HTTP and would otherwise get a 301.
"""

from django.core.cache import caches
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


@require_GET
@never_cache
def liveness(request):
    return JsonResponse({"status": "ok"})


def _check_database() -> str:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return "ok"
    except Exception:  # noqa: BLE001 -- any failure means "not ready"
        return "error"


def _check_redis() -> str:
    try:
        cache = caches["default"]
        cache.set("healthcheck", "1", 5)
        return "ok" if cache.get("healthcheck") == "1" else "error"
    except Exception:  # noqa: BLE001
        return "error"


@require_GET
@never_cache
def readiness(request):
    checks = {"database": _check_database(), "redis": _check_redis()}
    healthy = all(v == "ok" for v in checks.values())
    return JsonResponse(
        {"status": "ok" if healthy else "unavailable", "checks": checks},
        status=200 if healthy else 503,
    )
