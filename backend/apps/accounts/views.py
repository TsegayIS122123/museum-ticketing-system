"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.utils import OpenApiExample, extend_schema, inline_serializer
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import (
    AccountSerializer,
    AccountUpdateSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    StaffLoginSerializer,
    VisitorVerifyConfirmSerializer,
    VisitorVerifyStartSerializer,
)

# `AuthResponse` (Document 04) -- the token pair + profile shape shared by
# every flow that ends in a session (Visitor OTP confirm, Staff login).
# Declared here rather than in serializers.py since it's never used to
# parse a request, only to document `_auth_response`'s output below.
AuthResponseSerializer = inline_serializer(
    name="AuthResponse",
    fields={
        "access_token": serializers.CharField(),
        "refresh_token": serializers.CharField(),
        "user": AccountSerializer(),
    },
)

DetailResponseSerializer = inline_serializer(
    name="DetailResponse",
    fields={"detail": serializers.CharField()},
)


def _auth_response(account, refresh):
    """`AuthResponse` (Document 04) -- shared by every flow that ends in a
    session, Visitor OTP confirm and Staff login alike (Sec 4.1)."""
    return Response(
        {
            "access_token": str(refresh.access_token),
            "refresh_token": str(refresh),
            "user": AccountSerializer(account).data,
        }
    )


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
                    "refresh_token": "mock-refresh-token",
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