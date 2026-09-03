"""
accounts -- refresh-token cookie helpers

Sec 4.1 / ADR-002 originally handed both tokens to the frontend in the
response body, kept purely in JS memory. That breaks the moment the
browser leaves the origin and comes back -- e.g. Chapa's hosted checkout
(apps.payments.services) or a magic-link/email redirect -- because
in-memory state doesn't survive a full page navigation. The frontend then
finds no access token on the next page and treats the user as logged out.

Fix: the refresh token is set as an httpOnly cookie (this module) instead
of being returned in the response body. httpOnly means client-side JS
still can't read it (same XSS protection the in-memory-only approach was
chosen for), but the browser re-attaches it automatically on the next
request even after leaving and returning to the site, so the frontend can
silently mint a new access token on load instead of bouncing the visitor
to /verify.

The access token is NOT handled here -- it's still returned in the
response body and kept in memory client-side only. It's short-lived (15
minutes, SIMPLE_JWT.ACCESS_TOKEN_LIFETIME) and is what actually
authorizes API calls, so it's the one still worth keeping out of any
storage an XSS payload could read.
"""

from django.conf import settings

# Scoped to /api/v1/auth/ -- the cookie is only ever sent back on requests
# to the login/verify/refresh/logout endpoints, not on every API call.
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth/"


def set_refresh_cookie(response, refresh_token: str) -> None:
    """Attach `refresh_token` to `response` as an httpOnly cookie. Called
    everywhere a session is minted or rotated: Visitor OTP confirm, Staff
    login, and CookieTokenRefreshView (views.py)."""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        # Local dev runs both `web` and `api` over plain http://localhost
        # (docker-compose.yml) -- Secure would make the browser silently
        # drop the cookie there. Real deployments run DEBUG=False (Doc 08
        # Sec 3.1), so this still tracks Secure=True everywhere it needs to.
        secure=not settings.DEBUG,
        # Lax, not None: web/api are same-site (different ports, both
        # localhost in dev / same registrable domain in prod), so Lax is
        # enough for the top-level navigation back from Chapa's checkout
        # and doesn't require the extra CSRF surface SameSite=None invites.
        samesite="Lax",
    )


def clear_refresh_cookie(response) -> None:
    """Remove the refresh-token cookie. Called on logout (views.LogoutView)."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
