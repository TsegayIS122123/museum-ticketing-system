"""
Uniform API error contract -- Design Spec Sec 6.5.

Every error response follows the same envelope, with a message that is
localized per the Visitor's language preference, so Web and Mobile can
display errors generically without per-form translation logic:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, localized message",
    "field_errors": {"quantity": "Must be at least 1"}
  }
}
"""

from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    response.data = {
        "error": {
            "code": getattr(exc, "default_code", "error").upper(),
            "message": str(exc),
            "field_errors": response.data,
        }
    }
    return response
