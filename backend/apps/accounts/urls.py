"""
Mounted at /api/v1/auth/ (config/urls.py). `/users/me` and `auth/refresh/`
are mounted separately, directly in config/urls.py (Document 04 places the
profile endpoint under /api/v1/users/).

Registration, email verification (link + 6-digit code), and password reset
are served by django-allauth's headless API at /_allauth/ -- see
config/settings/base.py and apps/accounts/headless.py.
"""

from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    # Unified email + password sign-in for every role (FR-ACC-002,
    # FR-ACC-005, revised).
    path("login/", views.LoginView.as_view(), name="login"),
    # Clears the refresh-token cookie set by login (cookies.py).
    path("logout/", views.LogoutView.as_view(), name="logout"),
]
