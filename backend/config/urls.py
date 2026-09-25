"""
Root URLconf. Every Django app's own urls.py is included under
/api/v1/<app-name>/, mirroring the module boundaries in Design Spec Sec 3.2
so the API surface maps predictably to Document 04 (OpenAPI Specification).
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.accounts.views import CookieTokenRefreshView, CurrentUserView
from apps.bookings.urls import availability_urlpatterns
from apps.bookings.views import MyBookingsView
from apps.entrance.urls import entrance_urlpatterns
from apps.refunds.urls import refund_request_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),

    # Contract-first: this endpoint is introspected live from the actual
    # views/serializers below, then exported to ../contracts/openapi.yaml
    # (repo root) via `scripts/export_contract.sh`. That exported file is
    # the one thing frontend/ builds its types and mock server against.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    # Auth -- both credential paths share one refresh endpoint (Sec 4.1).
    # CookieTokenRefreshView (apps.accounts.views) reads/rotates the
    # refresh token from its httpOnly cookie -- see apps/accounts/cookies.py.
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/auth/refresh/", CookieTokenRefreshView.as_view(), name="token_refresh"),

    # Document 04 places the profile endpoint under /users/, not /auth/ --
    # mounted directly here rather than via apps.accounts.urls, which is
    # scoped to /api/v1/auth/ only.
    path("api/v1/users/me/", CurrentUserView.as_view(), name="current-user"),
    path("api/v1/users/me/bookings/", MyBookingsView.as_view(), name="my-bookings"),

    # Document 04: `/categories` and `/categories/{id}` are top-level
    # resources (no `/catalog` segment) -- unlike most other apps below,
    # this app's urls.py is included at the `/api/v1/` root directly.
    path("api/v1/", include("apps.catalog.urls")),
    # UAT round 1: `/institutions` is likewise top-level, same reasoning
    # as `/categories` above.
    path("api/v1/", include("apps.institutions.urls")),
    # Likewise `/availability` and `/availability/{date}` are top-level
    # (no `/bookings` segment) per Document 04.
    path("api/v1/", include(availability_urlpatterns)),
    path("api/v1/bookings/", include("apps.bookings.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
    # Document 04 places `/bookings/lookup` and `/bookings/{id}/check-in`
    # at the top level (no `/entrance` segment), even though `apps.entrance`
    # owns the business logic behind them (Design Spec Sec 3.2) -- see
    # apps/entrance/urls.py's module docstring.
    path("api/v1/", include(entrance_urlpatterns)),
    # Document 04 places `/bookings/{id}/refund-requests` at the top
    # level (no `/refunds` segment), even though `apps.refunds` owns the
    # business logic behind it -- see apps/refunds/urls.py's module
    # docstring.
    path("api/v1/", include(refund_request_urlpatterns)),
    path("api/v1/refunds/", include("apps.refunds.urls")),
    path("api/v1/settlement/", include("apps.settlement.urls")),
    # Document 04's actual paths are `/reports/dashboard` and
    # `/reports/summary` -- `apps.reporting` owns the business logic
    # (Design Spec Sec 3.2), but is mounted under `/reports/`, not
    # `/reporting/`, to match the contract exactly.
    path("api/v1/reports/", include("apps.reporting.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/admin/", include("apps.platform_admin.urls")),
]

# Serve user-uploaded/generated media (e.g. temporary receipt PDFs) locally.
# Only wired up when DEBUG=True (dev), since in staging/production media
# should be served by the reverse proxy or object storage, not Django --
# see Doc 08 Sec 3.2.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)