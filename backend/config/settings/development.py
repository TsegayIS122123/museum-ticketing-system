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

# Local dev default is SQLite unless DATABASE_URL is set (docker-compose sets it).
# See docker-compose.yml -- the `db` service provides Postgres.
