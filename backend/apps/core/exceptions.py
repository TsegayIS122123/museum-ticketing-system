"""
Uniform API error contract -- Design Spec Sec 6.5.

Every error response follows the same envelope, with a message that is
localized per the Visitor's language preference, so Web and Mobile can
display errors generically without per-form translation logic:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, localized message",
    "fieldErrors": {"quantity": "Must be at least 1"}
  }
}
"""

from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


class Conflict(APIException):
    """A well-formed request that can't be applied because of the
    resource's *current state* -- e.g. a booking that is no longer
    `Pending`, or a date closed to online booking (FR-BOOK-005/007/008).
    Distinct from `ValidationError` (400, bad input) per Document 04's
    409 responses on `POST /bookings`, `/cancel`, and `/reschedule`."""

    status_code = 409
    default_detail = "The request conflicts with the resource's current state."
    default_code = "conflict"


def _flatten_first_message(detail) -> str | None:
    """DRF's `exc.detail` is either a plain string/list (non-field errors)
    or a dict of `{field: [messages]}` (serializer field errors -- e.g.
    ResetPasswordSerializer.validate_new_password's validate_password()
    call). `str(exc)` on the dict case prints Python's raw repr --
    "{'new_password': [ErrorDetail(string='...', code='...')]}" -- which
    is what a client would otherwise show verbatim. Pull out the first
    real message instead so `message` is always human-readable, in either
    shape."""
    if isinstance(detail, dict):
        for messages in detail.values():
            if messages:
                first = messages[0] if isinstance(messages, list) else messages
                return str(first)
        return None
    if isinstance(detail, list):
        return str(detail[0]) if detail else None
    return str(detail) if detail else None


def _field_errors(detail) -> dict | None:
    """Only a field-keyed dict detail maps to `fieldErrors`; non-field
    errors (auth failures, bad tokens, etc.) have nothing to attach here."""
    if not isinstance(detail, dict):
        return None
    return {
        field: (str(messages[0]) if isinstance(messages, list) and messages else str(messages))
        for field, messages in detail.items()
    }


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = getattr(exc, "detail", None)
    message = _flatten_first_message(detail) or str(exc)

    response.data = {
        "error": {
            "code": getattr(exc, "default_code", "error").upper(),
            "message": message,
            "fieldErrors": _field_errors(detail),
        }
    }
    return response
