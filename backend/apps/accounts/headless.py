"""
accounts -- django-allauth headless integration

Two hooks, both selected via settings (config/settings/base.py):

- ``AccountHeadlessAdapter``: the JSON allauth returns for the signed-in
  user (`data.user`) is our own Account profile, not allauth's minimal
  ``{id, display, email, has_usable_password}`` default.

- ``SimpleJWTTokenStrategy``: allauth's session-token mechanism is kept as-is
  for the headless flows themselves (required -- allauth's internal flow
  state lives in the Django session), but the access/refresh pair surfaced to
  *app* clients (`/_allauth/app/v1/...`) in the response ``meta`` is the
  app's existing SimpleJWT pair. That means every other API endpoint keeps
  working with the same ``Authorization: Bearer`` token and ``token_version``
  revocation (apps/accounts/authentication.py, ADR-002) -- no second token
  system, no DRF authentication changes.
"""

import dataclasses
from typing import Any, Optional

from allauth.headless.adapter import DefaultHeadlessAdapter
from allauth.headless.tokens.strategies.sessions import SessionTokenStrategy
from rest_framework_simplejwt.exceptions import TokenError

from .authentication import AccountRefreshToken
from .serializers import AccountSerializer


class AccountHeadlessAdapter(DefaultHeadlessAdapter):
    """Returns the app's Account profile wherever allauth exposes the user."""

    def serialize_user(self, user) -> dict[str, Any]:
        return dict(AccountSerializer(user).data)

    def get_user_dataclass(self):
        def field(name, typ, description):
            return (name, typ, dataclasses.field(metadata={"description": description}))

        return dataclasses.make_dataclass(
            "AccountProfile",
            [
                field("id", str, "The account ID."),
                field("email", Optional[str], "The account's email address."),
                field("phone", Optional[str], "The account's phone number, if any."),
                field("full_name", str, "The account's full name."),
                field(
                    "role",
                    str,
                    "visitor | cashier | museum_manager | platform_admin.",
                ),
                field("language_preference", str, "en | am."),
                field("active", bool, "Whether the account may sign in."),
                field("email_verified_at", Optional[str], "When the email was verified."),
                field("phone_verified_at", Optional[str], "When the phone was verified."),
                field("created_at", str, "When the account was created."),
            ],
        )


class SimpleJWTTokenStrategy(SessionTokenStrategy):
    """Session tokens (allauth's internal flow state) are delegated to
    ``SessionTokenStrategy`` unchanged; only the access/refresh pair handed
    back to app clients is the app's SimpleJWT pair."""

    def create_access_token_payload(self, request) -> dict[str, Any] | None:
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return None
        refresh = AccountRefreshToken.for_user(user)
        return {
            "access_token": str(refresh.access_token),
            "refresh_token": str(refresh),
        }

    def create_access_token(self, request) -> str | None:
        payload = self.create_access_token_payload(request)
        return payload["access_token"] if payload else None

    def refresh_token(self, refresh_token: str) -> tuple[str, str] | None:
        try:
            token = AccountRefreshToken(refresh_token)
        except TokenError:
            return None
        return str(token.access_token), str(token)
