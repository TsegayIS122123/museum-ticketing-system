"""
Root URLconf. Every Django app's own urls.py is included under
/api/v1/<app-name>/, mirroring the module boundaries in Design Spec Sec 3.2
so the API surface maps predictably to Document 04 (OpenAPI Specification).
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import CurrentUserView
from apps.bookings.urls import availability_urlpatterns
from apps.bookings.views import MyBookingsView

urlpatterns = [
    path("admin/", admin.site.urls),

    # Contract-first: this endpoint is introspected live from the actual
    # views/serializers below, then exported to ../contracts/openapi.yaml
    # (repo root) via `scripts/export_contract.sh`. That exported file is
    # the one thing frontend/ builds its types and mock server against.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    # Auth -- both credential paths share one refresh endpoint (Sec 4.1).
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Document 04 places the profile endpoint under /users/, not /auth/ --
    # mounted directly here rather than via apps.accounts.urls, which is
    # scoped to /api/v1/auth/ only.
    path("api/v1/users/me/", CurrentUserView.as_view(), name="current-user"),
    path("api/v1/users/me/bookings/", MyBookingsView.as_view(), name="my-bookings"),

    # Document 04: `/categories` and `/categories/{id}` are top-level
    # resources (no `/catalog` segment) -- unlike most other apps below,
    # this app's urls.py is included at the `/api/v1/` root directly.
    path("api/v1/", include("apps.catalog.urls")),
    # Likewise `/availability` and `/availability/{date}` are top-level
    # (no `/bookings` segment) per Document 04.
    path("api/v1/", include(availability_urlpatterns)),
    path("api/v1/bookings/", include("apps.bookings.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
    path("api/v1/entrance/", include("apps.entrance.urls")),
    path("api/v1/refunds/", include("apps.refunds.urls")),
    path("api/v1/settlement/", include("apps.settlement.urls")),
    path("api/v1/reporting/", include("apps.reporting.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/admin/", include("apps.platform_admin.urls")),
]