"""
Development settings -- local Docker Compose, seeded fixture data.
Per Design Spec Sec 8.2 / Doc 08 Sec 3.1.

Per Doc 08 Sec 3.2: staging/production never hold real Chapa keys or real
SMS/email credentials -- but development shouldn't either. Use Chapa's
sandbox mode and a console/suppressed email backend locally (see .env.example).
"""

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = True
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*"])

# Chapa's sandbox rejects refunds outright (verify succeeds, refund 404s --
# a gateway-side sandbox restriction, not a bug here). Mock it locally so
# the refund pipeline is still testable; see base.CHAPA_MOCK_REFUNDS and
# apps.refunds.services.call_chapa_refund_api. Flip back to real calls by
# setting CHAPA_MOCK_REFUNDS=False once Chapa goes live and real refunds
# are needed against this environment.
CHAPA_MOCK_REFUNDS = env.bool("CHAPA_MOCK_REFUNDS", default=True)

# If EMAIL_HOST is empty, this falls back to the console backend via base.py; the
# email then prints to `docker compose logs api` and does not reach a mailbox. The
# full SMTP setup is: fill EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD in
# backend/.env.
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend",
)

# Drop allauth's "[<site.name>] " subject prefix (see
# DefaultAccountAdapter.format_email_subject -- it prepends the prefix when
# this setting is unset, so an empty string is what removes it). A template
# override cannot do this: the prefix is added in the adapter, not the
# template. Scoped to development because B1 keeps base.py untouched; move to
# base.py to apply the same subject line in staging/production.
ACCOUNT_EMAIL_SUBJECT_PREFIX = ""

# Local dev default is SQLite unless DATABASE_URL is set (docker-compose sets it).
# See docker-compose.yml -- the `db` service provides Postgres.
