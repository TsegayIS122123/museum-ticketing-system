"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).

The account lifecycle (register / email-verify / password-reset) is served by
django-allauth at /_allauth/ (see config/settings/base.py); this module keeps
only the app's own session endpoints -- the unified sign-in, refresh, logout,
and the shared profile endpoint.
"""

from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    extend_schema,
    inline_serializer,
)
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView

from . import services
from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .serializers import (
    AccountSerializer,
    AccountUpdateSerializer,
    LoginSerializer,
)

# `AuthResponse` (Document 04) -- the access token + profile shape returned
# by the unified sign-in. The refresh token is NOT part of this response body
# for web clients -- it's set as an httpOnly cookie instead (see cookies.py)
# so it survives a full page navigation (e.g. leaving for Chapa's hosted
# checkout and coming back) without ever being readable by frontend JS.
# Native clients (Expo) cannot rely on cookie persistence, so they opt into
# receiving the refresh token in the body via the X-Client-Platform request
# header (see `_client_wants_refresh_in_body`).
AuthResponseSerializer = inline_serializer(
    name="AuthResponse",
    fields={
        "access_token": serializers.CharField(),
        "refresh_token": serializers.CharField(
            required=False,
            help_text="Only present when the request carries "
            "`X-Client-Platform: expo`. Native clients store it themselves; "
            "web clients receive it as an httpOnly cookie instead.",
        ),
        "user": AccountSerializer(),
    },
)

DetailResponseSerializer = inline_serializer(
    name="DetailResponse",
    fields={"detail": serializers.CharField()},
)

# Shared across every endpoint that can issue or rotate a session token
# (sign-in, token refresh). A native client sends `X-Client-Platform: expo`
# to receive the refresh token in the JSON body instead of (or in addition
# to) the httpOnly cookie it cannot durably keep. Absent / any other value
# means "web" and preserves the cookie-only contract.
X_CLIENT_PLATFORM_PARAM = OpenApiParameter(
    name="X-Client-Platform",
    location=OpenApiParameter.HEADER,
    required=False,
    type=str,
    enum=["web", "expo"],
    default="web",
    description="Caller platform. `expo` returns the refresh token in the "
    "response body (auth responses) and accepts it in the request body "
    "(refresh); `web` (default) uses the httpOnly refresh cookie.",
)

TokenRefreshRequestSerializer = inline_serializer(
    name="TokenRefreshRequest",
    fields={
        "refresh_token": serializers.CharField(
            required=False,
            help_text="Required only when `X-Client-Platform: expo`; web "
            "clients omit it and rely on the httpOnly refresh cookie.",
        )
    },
)


def _client_wants_refresh_in_body(request):
    """True when the caller is a native client that cannot persist the
    httpOnly refresh cookie and therefore expects the refresh token in the
    JSON body (`X-Client-Platform: expo`)."""
    return request.headers.get("X-Client-Platform", "").lower() == "expo"


def _auth_response(account, refresh, request):
    """`AuthResponse` (Document 04). Mints the response body (access token +
    profile) and, for web callers, attaches the refresh token to the response
    as an httpOnly cookie rather than handing it to the frontend directly.
    Native callers (`X-Client-Platform: expo`) get it in the body instead."""
    payload = {
        "access_token": str(refresh.access_token),
        "user": AccountSerializer(account).data,
    }
    if _client_wants_refresh_in_body(request):
        payload["refresh_token"] = str(refresh)
        return Response(payload)

    response = Response(payload)
    set_refresh_cookie(response, str(refresh))
    return response


class LoginView(APIView):
    """POST /auth/login -- the single front-door sign-in for every role
    (FR-ACC-002, FR-ACC-005, revised). Email + password only; the caller's
    `role` is returned on `user` and the client routes from there."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    @extend_schema(
        request=LoginSerializer,
        responses=AuthResponseSerializer,
        parameters=[X_CLIENT_PLATFORM_PARAM],
        examples=[
            OpenApiExample(
                "Sign in (mock)",
                value={
                    "access_token": "mock-access-token",
                    "user": {
                        "id": "00000000-0000-0000-0000-000000000001",
                        "email": "manager@znhm.et",
                        "phone": None,
                        "full_name": "Mock Museum Manager",
                        "role": "museum_manager",
                        "language_preference": "en",
                        "active": True,
                        "email_verified_at": None,
                        "phone_verified_at": None,
                        "created_at": "2026-01-01T00:00:00Z",
                    },
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account, refresh = services.authenticate(**serializer.validated_data)
        return _auth_response(account, refresh, request)


class CurrentUserView(APIView):
    """GET/PUT /users/me -- Visitor and Staff share this endpoint; there is
    no scoped RBAC to check beyond "is this account authenticated" (Sec 4.3)."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=AccountSerializer)
    def get(self, request):
        return Response(AccountSerializer(request.user).data)

    @extend_schema(request=AccountUpdateSerializer, responses=AccountSerializer)
    def put(self, request):
        serializer = AccountUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        account = services.update_profile(account=request.user, **serializer.validated_data)
        return Response(AccountSerializer(account).data)


class CookieTokenRefreshView(TokenRefreshView):
    """POST /auth/refresh/ -- mounted at the root urlconf (config/urls.py).

    Reads the refresh token from the httpOnly cookie set by `_auth_response`
    above instead of requiring it in the request body -- the frontend never
    holds or sends the refresh token itself (cookies.py). Re-sets the cookie
    with the rotated token on success, per SIMPLE_JWT's ROTATE_REFRESH_TOKENS.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(
        request=TokenRefreshRequestSerializer,
        parameters=[X_CLIENT_PLATFORM_PARAM],
        responses={
            200: inline_serializer(
                name="TokenRefreshResponse",
                fields={
                    "access": serializers.CharField(),
                    "refresh_token": serializers.CharField(
                        required=False,
                        help_text="Only present when the request carries "
                        "`X-Client-Platform: expo`.",
                    ),
                },
            ),
            401: DetailResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        wants_body = _client_wants_refresh_in_body(request)
        if wants_body:
            raw_refresh = request.data.get("refresh_token")
        else:
            raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)

        if not raw_refresh:
            detail = (
                "No refresh token provided."
                if wants_body
                else "No refresh token cookie."
            )
            return Response({"detail": detail}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            # Expired/invalid/already-rotated token -- clear the cookie so
            # the browser stops presenting a dead token on every subsequent
            # page load, and let the frontend fall back to a normal login.
            response = Response(
                {"detail": "Refresh token invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        payload = {"access": serializer.validated_data["access"]}
        rotated_refresh = serializer.validated_data.get("refresh")
        if wants_body and rotated_refresh:
            payload["refresh_token"] = rotated_refresh

        response = Response(payload)
        if rotated_refresh and not wants_body:
            set_refresh_cookie(response, rotated_refresh)
        return response


class LogoutView(APIView):
    """POST /auth/logout -- clears the refresh-token cookie so the browser
    stops presenting it. Server-side refresh-token revocation is handled by
    SIMPLE_JWT rotation/blacklist semantics, not this view."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses=DetailResponseSerializer)
    def post(self, request):
        response = Response({"detail": "Logged out."})
        clear_refresh_cookie(response)
        return response
