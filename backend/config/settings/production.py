"""
Production settings.
Per Doc 08 Sec 3.2: secrets are injected at runtime via environment
variables from a managed secrets manager -- never committed, never baked
into the image layer.
"""

import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.django import DjangoIntegration

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Load-balancer probes are plain HTTP -- don't 301 them (apps/core/health.py).
SECURE_REDIRECT_EXEMPT = [r"^healthz$", r"^readyz$"]
SECURE_HSTS_PRELOAD = False  # opt in deliberately once every subdomain is HTTPS

# Phase 8 security review. Django's defaults already set most of these in
# recent versions; they are pinned here so the production posture is
# explicit and a Django upgrade can't silently loosen it.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# The browser app is a separate origin (Next.js) -- Django's CSRF check
# for any cookie-authenticated POST (admin, refresh cookie) only passes for
# origins listed here. Same list as CORS: one source of truth.
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS  # noqa: F405

# Error tracking -- no-op unless SENTRY_DSN is set (e.g. still unset the
# first time this image runs in a fresh environment). send_default_pii is
# explicitly off: this system holds real visitor PII (Sec 6.7 / Document
# 05) -- name, phone, email -- and Sentry events aren't in scope for that
# data's access controls.
SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        release=env("GIT_COMMIT_SHA", default=None),
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.1),
        send_default_pii=False,
    )