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

# Local dev default is SQLite unless DATABASE_URL is set (docker-compose sets it).
# See docker-compose.yml -- the `db` service provides Postgres.
