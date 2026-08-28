"""
Mounted at /api/v1/auth/ (config/urls.py). TokenRefreshView is wired at the
root urlconf, shared by both credential paths (Sec 4.1).
"""

from rest_framework.routers import DefaultRouter

app_name = "accounts"
router = DefaultRouter()
# router.register("example", views.ExampleViewSet, basename="example")

urlpatterns = [
    # Visitor passwordless path (FR-ACC-001, FR-ACC-003, FR-ACC-004):
    # path("otp/request/", views.RequestOTPView.as_view()),
    # path("otp/verify/", views.VerifyOTPView.as_view()),
    # path("magic-link/request/", views.RequestMagicLinkView.as_view()),
    # path("magic-link/verify/", views.VerifyMagicLinkView.as_view()),
    #
    # Staff password path (FR-ACC-002, FR-ACC-005, FR-ACC-006):
    # path("staff/login/", views.StaffLoginView.as_view()),
    # path("staff/password-reset/", views.RequestPasswordResetView.as_view()),
    # path("staff/password-reset/confirm/", views.ConfirmPasswordResetView.as_view()),
]

urlpatterns += router.urls
