"""Phase 8: the public, guessable/enumerable endpoints are all throttled."""

from django.conf import settings

from apps.accounts import views as account_views
from apps.institutions.views import InstitutionLookupView


def test_every_public_guessing_endpoint_declares_a_configured_scope():
    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    views = [
        account_views.RequestOTPView,
        account_views.VerifyOTPView,
        account_views.VerifyMagicLinkView,
        account_views.StaffLoginView,
        account_views.RequestPasswordResetView,
        account_views.ConfirmPasswordResetView,
        InstitutionLookupView,
    ]
    for view in views:
        scope = getattr(view, "throttle_scope", None)
        assert scope, f"{view.__name__} has no throttle_scope"
        assert scope in rates, f"{view.__name__} scope {scope!r} has no configured rate"
