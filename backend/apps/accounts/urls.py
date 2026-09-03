"""
Mounted at /api/v1/auth/ (config/urls.py). TokenRefreshView is wired at the
root urlconf, shared by both credential paths (Sec 4.1). `/users/me` is
mounted separately, directly in config/urls.py, since Document 04 places
it under /api/v1/users/ rather than /api/v1/auth/.
"""

from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    # Visitor passwordless path (FR-ACC-001, FR-ACC-003, FR-ACC-004):
    path("visitor/verify/start/", views.RequestOTPView.as_view(), name="visitor-verify-start"),
    path("visitor/verify/confirm/", views.VerifyOTPView.as_view(), name="visitor-verify-confirm"),
    path(
        "visitor/verify/email/<str:token>/",
        views.VerifyMagicLinkView.as_view(),
        name="visitor-verify-email",
    ),
    #
    # Staff password path (FR-ACC-002, FR-ACC-005, FR-ACC-006):
    path("login/", views.StaffLoginView.as_view(), name="staff-login"),
    path("forgot-password/", views.RequestPasswordResetView.as_view(), name="forgot-password"),
    path("reset-password/", views.ConfirmPasswordResetView.as_view(), name="reset-password"),
    #
    # Shared by both credential paths -- clears the refresh-token cookie
    # set by login/verify (Sec 4.1, apps/accounts/cookies.py).
    path("logout/", views.LogoutView.as_view(), name="logout"),
]