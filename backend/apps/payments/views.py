"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).
"""

from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import ChapaWebhookSerializer


class ChapaWebhookView(APIView):
    """POST /payments/webhooks/chapa/ -- AllowAny + signature check
    (Design Spec Sec 4.2; NFR-SEC-001). The only path that confirms a
    booking (FR-PAY-002) -- never the client-side `return_url` redirect.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(
        operation_id="handleChapaWebhook",
        request=ChapaWebhookSerializer,
        responses={200: None, 400: None, 401: None},
    )
    def post(self, request, *args, **kwargs):
        # Chapa sends two different headers with two different formulas:
        #   X-Chapa-Signature = HMAC_SHA256(secret, raw_body)  -- verifies the event body
        #   Chapa-Signature   = HMAC_SHA256(secret, secret)    -- constant, NOT payload-based
        # We must check X-Chapa-Signature first (it's the one verify_webhook_signature
        # actually validates against); falling back to Chapa-Signature here would only
        # ever match a secret-derived constant, which never equals HMAC(secret, body).
        signature = request.headers.get("X-Chapa-Signature") or request.headers.get(
            "Chapa-Signature"
        )
        if not services.verify_webhook_signature(
            raw_body=request.body, signature_header=signature
        ):
            return Response(
                {
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Invalid webhook signature.",
                        "field_errors": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = ChapaWebhookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # The full raw payload (not just validated_data) is what gets
        # stored/interpreted -- Chapa's payload carries fields beyond the
        # two validated here (Document 04's `additionalProperties: true`).
        services.confirm_payment_from_webhook(payload=request.data)
        return Response(status=status.HTTP_200_OK)
