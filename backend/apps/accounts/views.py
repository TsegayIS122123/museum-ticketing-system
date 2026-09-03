"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.utils import OpenApiExample, extend_schema, inline_serializer
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView

from . import services
from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .serializers import (
    AccountSerializer,
    AccountUpdateSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    StaffLoginSerializer,
    VisitorVerifyConfirmSerializer,
    VisitorVerifyStartSerializer,
)

# `AuthResponse` (Document 04) -- the access token + profile shape shared
# by every flow that ends in a session (Visitor OTP confirm, Staff
# login). The refresh token is NOT part of this response body -- it's set
# as an httpOnly cookie instead (see cookies.py) so it survives a full
# page navigation (e.g. leaving for Chapa's hosted checkout and coming
# back) without ever being readable by frontend JS.
# Declared here rather than in serializers.py since it's never used to
# parse a request, only to document `_auth_response`'s output below.
AuthResponseSerializer = inline_serializer(
    name="AuthResponse",
    fields={
        "access_token": serializers.CharField(),
        "user": AccountSerializer(),
    },
)

DetailResponseSerializer = inline_serializer(
    name="DetailResponse",
    fields={"detail": serializers.CharField()},
)


def _auth_response(account, refresh):
    """`AuthResponse` (Document 04) -- shared by every flow that ends in a
    session, Visitor OTP confirm and Staff login alike (Sec 4.1). Mints
    the response body (access token + profile) and, as a side effect,
    attaches the refresh token to the response as an httpOnly cookie
    rather than handing it to the frontend directly."""
    response = Response(
        {
            "access_token": str(refresh.access_token),
            "user": AccountSerializer(account).data,
        }
    )
    set_refresh_cookie(response, str(refresh))
    return response


class RequestOTPView(APIView):
    """POST /auth/visitor/verify/start (FR-ACC-001, FR-ACC-003, FR-ACC-004).
    Used for both a first-time booking and a returning Visitor looking up
    their history -- there is no separate "login" for a Visitor."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "otp-request"

    @extend_schema(
        request=VisitorVerifyStartSerializer,
        responses=inline_serializer(
            name="VisitorVerifyStartResponse",
            fields={
                "verification_id": serializers.UUIDField(),
                "otp_expires_in_seconds": serializers.IntegerField(),
            },
        ),
    )
    def post(self, request):
        serializer = VisitorVerifyStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account, otp_expires_in_seconds = services.start_visitor_verification(
            **serializer.validated_data
        )
        return Response(
            {
                "verification_id": account.id,
                "otp_expires_in_seconds": otp_expires_in_seconds,
            }
        )


class VerifyOTPView(APIView):
    """POST /auth/visitor/verify/confirm -- completes Visitor verification
    and issues the same token pair Staff login does (Sec 4.1)."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(request=VisitorVerifyConfirmSerializer, responses=AuthResponseSerializer)
    def post(self, request):
        serializer = VisitorVerifyConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account, refresh = services.confirm_visitor_verification(**serializer.validated_data)
        return _auth_response(account, refresh)


class VerifyMagicLinkView(APIView):
    """GET /auth/visitor/verify/email/{token} -- the secondary/fallback
    verification channel (Sec 4.1 step 2). Opening this link marks
    `email_verified_at` but never issues a session on its own; only the
    OTP path above does that."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=DetailResponseSerializer)
    def get(self, request, token):
        services.confirm_email_verification(token=token)
        return Response({"detail": "Email verified."})


class StaffLoginView(APIView):
    """POST /auth/login -- Staff only (FR-ACC-002, FR-ACC-005)."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    @extend_schema(
        request=StaffLoginSerializer,
        responses=AuthResponseSerializer,
        examples=[
            OpenApiExample(
                "Staff login (mock)",
                value={
                    "access_token": "mock-access-token",
                    "user": {
                        "id": "00000000-0000-0000-0000-000000000001",
                        "email": "manager@sciencemuseum.et",
                        "phone": None,
                        "full_name": "Mock Museum Manager",
                        "role": "museum_manager",
                        "language_preference": "en",
                        "active": True,
                        "created_at": "2026-01-01T00:00:00Z",
                    },
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account, refresh = services.staff_login(**serializer.validated_data)
        return _auth_response(account, refresh)


class RequestPasswordResetView(APIView):
    """POST /auth/forgot-password -- Staff only (FR-ACC-006). Always 200;
    see services.request_password_reset for why."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "password-reset-request"

    @extend_schema(request=ForgotPasswordSerializer, responses=DetailResponseSerializer)
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_password_reset(**serializer.validated_data)
        return Response({"detail": "If that email is on file, a reset link has been sent."})


class ConfirmPasswordResetView(APIView):
    """POST /auth/reset-password -- Staff only (FR-ACC-006)."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(request=ResetPasswordSerializer, responses=DetailResponseSerializer)
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.reset_password(**serializer.validated_data)
        return Response({"detail": "Password updated."})


class CurrentUserView(APIView):
    """GET/PUT /users/me -- Visitor and Staff share this endpoint; there is
    no scoped RBAC to check beyond "is this account authenticated" (Sec 4.3)."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=AccountSerializer)
    def get(self, request):
        return Response(AccountSerializer(request.user).data)

    @extend_schema(request=AccountUpdateSerializer, responses=AccountSerializer)
    def put(self, request):
        serializer = AccountUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        account = services.update_profile(account=request.user, **serializer.validated_data)
        return Response(AccountSerializer(account).data)


class CookieTokenRefreshView(TokenRefreshView):
    """POST /auth/refresh/ -- mounted at the root urlconf (config/urls.py),
    shared by both credential paths (Sec 4.1).

    Reads the refresh token from the httpOnly cookie set by `_auth_response`
    above instead of requiring it in the request body -- the frontend never
    holds or sends the refresh token itself (cookies.py). Re-sets the
    cookie with the rotated token on success, per SIMPLE_JWT's
    ROTATE_REFRESH_TOKENS.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(
        request=None,
        responses={
            200: inline_serializer(
                name="TokenRefreshResponse", fields={"access": serializers.CharField()}
            ),
            401: DetailResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not raw_refresh:
            return Response(
                {"detail": "No refresh token cookie."}, status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            # Expired/invalid/already-rotated cookie -- clear it so the
            # browser stops presenting a dead token on every subsequent
            # page load, and let the frontend fall back to a normal login.
            response = Response(
                {"detail": "Refresh token invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            raise InvalidToken(exc.args[0]) from exc

        response = Response({"access": serializer.validated_data["access"]})
        rotated_refresh = serializer.validated_data.get("refresh")
        if rotated_refresh:
            set_refresh_cookie(response, rotated_refresh)
        return response


class LogoutView(APIView):
    """POST /auth/logout -- clears the refresh-token cookie so the browser
    stops presenting it. Note: this does not blacklist the token
    server-side -- SIMPLE_JWT.BLACKLIST_AFTER_ROTATION=True already assumes
    that, but `rest_framework_simplejwt.token_blacklist` isn't in
    INSTALLED_APPS (config/settings/base.py), so today every rotation's
    `refresh.blacklist()` call is silently swallowed (simplejwt only
    defines that method when the app is installed, and the rotation code
    catches the resulting AttributeError). Worth installing + migrating
    that app separately so old refresh tokens are actually invalidated,
    not just no-longer-cookied on this device.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses=DetailResponseSerializer)
    def post(self, request):
        response = Response({"detail": "Logged out."})
        clear_refresh_cookie(response)
        return response