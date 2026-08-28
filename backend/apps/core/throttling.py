"""
core.throttling -- rate-limit counters backed by Redis DB 2 (Sec 6.2/6.7).

Kept as a distinct cache alias ("ratelimit", see config/settings/base.py)
from the category/availability cache (DB 1), so a burst of failed logins
can never evict a hot cache entry or vice versa.

Scopes to wire up per Sec 6.7:
- login             5 per 15 min, per account
- booking-create    capped per account/IP (fraudulent AwaitingPayment bookings)
- refund-request    capped per booking
"""

from rest_framework.throttling import ScopedRateThrottle


class RedisScopedRateThrottle(ScopedRateThrottle):
    cache = None  # TODO: point at the "ratelimit" cache alias once configured.
