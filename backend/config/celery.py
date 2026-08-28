"""
Celery application entrypoint.

Per Design Spec Sec 8.1: Celery Worker replicas scale freely, per-queue
(notifications / documents / payments -- Sec 6.1-6.2), since every job is
idempotent/safely retryable (NFR-IDEMPOTENT-001). Celery Beat runs as
exactly ONE replica (ADR-003) -- a second replica would duplicate the
daily no-show/refund checks (apps/bookings/tasks.py). This file is shared
by both worker and beat; the difference is only the CMD in docker-compose.yml.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("museum_ticketing")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
