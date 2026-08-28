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

from django.core.cache import caches
from rest_framework.throttling import ScopedRateThrottle

_DURATIONS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


class RedisScopedRateThrottle(ScopedRateThrottle):
    cache = caches["ratelimit"]

    def parse_rate(self, rate):
        """DRF's own `parse_rate` only recognizes a bare unit ("5/min"),
        not a multiplier ("5/15m") -- overridden here so scopes can express
        the actual windows from Sec 6.7 ("5 per 15 minutes"), not just
        the nearest whole unit DRF supports out of the box."""
        if rate is None:
            return (None, None)
        num, period = rate.split("/")
        num_requests = int(num)
        digits = "".join(ch for ch in period if ch.isdigit())
        multiplier = int(digits) if digits else 1
        duration = _DURATIONS[period[-1]] * multiplier
        return (num_requests, duration)