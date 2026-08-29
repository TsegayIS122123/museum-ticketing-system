"""
Base settings, shared by every environment (development / staging / production).

Per Design Spec Sec 8.2: environments share the same container image and differ
only by configuration and data -- this file must never contain environment-
specific values. Those go in development.py / production.py.

Unlike a template that defers background jobs, this project wires Celery +
Redis in from the start (ADR-003) -- FR-PAY-005's daily jobs are core MVP
behavior, not a later scaling concern.

Object storage (ADR-005/ADR-009) is DEFERRED for now -- using local
filesystem storage until there's a paid S3/MinIO account to point at. See
the "Object storage" section below for exactly what to uncomment when
that's ready; no other file needs to change.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="insecure-dev-key-change-me")

# --------------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "drf_spectacular",
    "django_celery_beat",
    "django_celery_results",
    # Re-enable when object storage comes back (see base.py's Object
    # storage section below, and requirements/base.txt):
    # "storages",
]

# Module-to-requirement mapping -- Design Spec Sec 3.2. Dependency order
# (see README "Build order"); enforced by code convention (services.py
# imports), not by app-registration order or a tenant-scoping layer
# (ADR-004: single venue, no multi-tenancy).
LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.bookings",
    "apps.payments",
    "apps.entrance",
    "apps.refunds",
    "apps.settlement",
    "apps.reporting",
    "apps.notifications",
    "apps.platform_admin",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",  # I18N -- Design Spec Sec 6.4
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # Bilingual receipt/notice templates (Sec 6.4) live under
        # apps/<app>/templates/ once the first document is built.
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

AUTH_USER_MODEL = "accounts.Account"

# --------------------------------------------------------------------------
# Database -- configured per-environment via DATABASE_URL (Sec 3.2, Doc 08)
# --------------------------------------------------------------------------

DATABASES = {
    "default": env.db("DATABASE_URL", default="sqlite:///db.sqlite3"),
}

# --------------------------------------------------------------------------
# Password validation (Staff path only -- Sec 4.1; Visitor path is
# passwordless and never touches these validators)
# --------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --------------------------------------------------------------------------
# I18N -- bilingual UI per Design Spec Sec 6.4 (English / Amharic)
# --------------------------------------------------------------------------

LANGUAGE_CODE = "en"
LANGUAGES = [
    ("en", "English"),
    ("am", "Amharic"),
]
TIME_ZONE = "Africa/Addis_Ababa"
USE_I18N = True
USE_TZ = True

# Fiscal-year boundary underlying NFR-RETENTION-001 (Document 02 Sec 5 flags
# this as an open question) -- configured, not hard-coded, so confirming it
# later with the Finance Office is a config change, not a migration.
FISCAL_YEAR_START_MONTH = env.int("FISCAL_YEAR_START_MONTH", default=7)
FISCAL_YEAR_START_DAY = env.int("FISCAL_YEAR_START_DAY", default=1)

# --------------------------------------------------------------------------
# Static / media
# --------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# DRF + JWT -- Design Spec Sec 4.1/ADR-002 (stateless JWT across Web,
# Mobile, and the Staff dashboard -- a native app can't share a browser
# session cookie, so JWT is the common denominator across all three clients)
# --------------------------------------------------------------------------

REST_FRAMEWORK = {
    # ADR-002: token_version-aware subclass of JWTAuthentication -- an
    # access token whose token_version claim no longer matches the account
    # row (e.g. right after a Staff password reset) is rejected immediately
    # instead of remaining valid for its full 15-minute lifetime.
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.accounts.authentication.TokenVersionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Document 04's `data`/`meta` (limit/offset/total) list envelope --
    # see apps.core.pagination for why this replaces DRF's own
    # count/next/previous/results shape.
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.EnvelopeLimitOffsetPagination",
    "DEFAULT_THROTTLE_CLASSES": (
        "apps.core.throttling.RedisScopedRateThrottle",
    ),
    # Sec 6.7. Views opt in per-endpoint via `throttle_scope`; a view with
    # no `throttle_scope` attribute is unaffected regardless of this list.
    "DEFAULT_THROTTLE_RATES": {
        "login": "5/15m",
        "otp-request": "5/15m",
        "password-reset-request": "5/15m",
        # FR-BOOK-001/003: capped per account/IP against fraudulent
        # AwaitingPayment/PendingApproval bookings (Sec 6.7).
        "booking-create": "10/15m",
    },
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# --------------------------------------------------------------------------
# drf-spectacular -- this IS the contract. Regenerated from real views/
# serializers via `scripts/export_contract.sh`, never hand-edited.
# --------------------------------------------------------------------------

SPECTACULAR_SETTINGS = {
    "TITLE": "Museum Ticketing & Booking Platform API",
    "DESCRIPTION": "Bilingual (EN/AM) online booking, payment, and gate "
                    "check-in for the Science Museum's digital ticketing track.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ADR-002: token_version bumped on password reset / manual revocation
# invalidates all outstanding access tokens for that account platform-wide.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# --------------------------------------------------------------------------
# CORS -- Next.js web app only; Mobile (React Native) and the Staff
# dashboard (same Next.js app, /staff/* routes) don't need a separate entry.
# --------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])

# --------------------------------------------------------------------------
# Redis -- three logical DB indices, Design Spec Sec 6.2. Kept as separate
# indices (not just separate key prefixes) so a rate-limit burst can never
# evict a hot category/availability cache entry or vice versa.
# --------------------------------------------------------------------------

REDIS_URL = env("REDIS_URL", default="redis://redis:6379")

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=f"{REDIS_URL}/0")
CELERY_RESULT_BACKEND = "django-db"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

# Per Document 08 Sec 2.1/7.2: separate replica pools per queue so a
# backlog in one (e.g. notifications during a busy weekend) cannot starve
# another (e.g. payments, which carries process_refund + settlement calls).
CELERY_TASK_ROUTES = {
    "apps.notifications.tasks.*": {"queue": "notifications"},
    "apps.payments.tasks.*": {"queue": "documents"},
    "apps.settlement.tasks.*": {"queue": "documents"},
    "apps.refunds.tasks.*": {"queue": "payments"},
    "apps.bookings.tasks.*": {"queue": "payments"},
}

CACHES = {
    # DB 1 -- category list / date-availability cache (Sec 6.2), invalidated
    # on write (a price change or date closure), never left to a fixed TTL.
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"{REDIS_URL}/1",
    },
    # DB 2 -- rate-limit counters (Sec 6.2/6.7): login, booking-creation,
    # refund-request attempts. Kept separate from "default" deliberately.
    "ratelimit": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"{REDIS_URL}/2",
    },
}

# --------------------------------------------------------------------------
# Object storage -- DISABLED for now, using local filesystem storage
# instead. The design (ADR-005/ADR-009) calls for S3-compatible storage
# (MinIO self-hosted, or managed S3/R2/etc. once there's a paid account) --
# receipts are rendered once and never regenerated, so storage durability
# matters as much as the database's, and local disk does NOT survive
# horizontal scaling or a container rebuild. Re-enable the moment either of
# those becomes true, or as soon as a paid account exists, by:
#   1. Uncommenting the S3 STORAGES block and AWS_* vars below
#   2. Uncommenting `storages` in THIRD_PARTY_APPS above
#   3. Uncommenting django-storages[s3] in requirements/base.txt
#   4. Uncommenting the `minio` service (+ its depends_on entries) in
#      docker-compose.yml, or pointing AWS_S3_ENDPOINT_URL at the real
#      managed S3/MinIO endpoint
# No application code changes anywhere else -- every app only ever calls
# Django's storage API, never S3/MinIO directly.
# --------------------------------------------------------------------------

# STORAGES = {
#     "default": {"BACKEND": "storages.backends.s3.S3Storage"},
#     "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
# }
#
# AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="museum-ticketing")
# AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="http://minio:9000")
# AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
# AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
# AWS_S3_ADDRESSING_STYLE = "path"  # required for MinIO path-style buckets

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# --------------------------------------------------------------------------
# Chapa -- payment aggregator (Telebirr, CBE Birr, card all route through
# it -- ADR-008). Webhook is the ONLY path that confirms a booking payment.
# --------------------------------------------------------------------------

CHAPA_PUBLIC_KEY = env("CHAPA_PUBLIC_KEY", default="")
CHAPA_SECRET_KEY = env("CHAPA_SECRET_KEY", default="")
CHAPA_WEBHOOK_SECRET = env("CHAPA_WEBHOOK_SECRET", default="")

# Publicly reachable base URLs, needed only because Chapa's checkout-session
# API requires real, absolute URLs to call back to: `callback_url` (the
# server-to-server webhook, Sec 4.2) and `return_url` (where Chapa redirects
# the Visitor's browser after paying -- never trusted on its own, FR-PAY-002).
# Defaults match docker-compose.yml's local ports; a real deployment (Doc 08)
# overrides both with its actual public hostnames.
PUBLIC_API_BASE_URL = env("PUBLIC_API_BASE_URL", default="http://localhost:8000")
PUBLIC_WEB_BASE_URL = env("PUBLIC_WEB_BASE_URL", default="http://localhost:3000")

# --------------------------------------------------------------------------
# SMS / Email gateways -- SMS is primary for Visitor OTP (FR-ACC-001) and
# is the higher-urgency alert (Document 08 Sec 5.2); email is the magic-link
# fallback verification path, plus the Staff password-reset channel.
# --------------------------------------------------------------------------

SMS_GATEWAY_API_KEY = env("SMS_GATEWAY_API_KEY", default="")
SMS_GATEWAY_SENDER_ID = env("SMS_GATEWAY_SENDER_ID", default="")

EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
