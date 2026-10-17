"""
drf-spectacular extensions for this app.

`TokenVersionAuthentication` subclasses simplejwt's `JWTAuthentication`,
but drf-spectacular only ships a built-in `OpenApiAuthenticationExtension`
for the exact `JWTAuthentication` class -- it does not walk subclasses.
Without this, every view using our authenticator logs "could not resolve
authenticator" and is documented as unauthenticated. Registering our own
extension (imported via AccountsConfig.ready(), see apps.py) fixes that;
the security definition itself is identical to simplejwt's own (Bearer/JWT).

`inject_headless_auth_paths` is a postprocessing hook (wired up via
SPECTACULAR_SETTINGS in config/settings/base.py). django-allauth's headless
views are the account lifecycle endpoints (signup / email-verify /
password-reset) and are deliberately NOT DRF views we own, so drf-spectacular
does not introspect them -- and they are built dynamically per HEADLESS_CLIENTS
at import time, so they cannot be silently omitted from the published contract.
This hook documents the subset the clients actually call, for both the
`browser` and `app` clients. See Documents 04 (API contract) and 05 (security).
"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.plumbing import ResolvedComponent

# Must mirror HEADLESS_CLIENTS in config/settings/base.py.
_HEADLESS_CLIENTS = ("browser", "app")

_TAG = "auth (allauth headless)"


class TokenVersionAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.TokenVersionAuthentication"
    name = "TokenVersionAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }


def _json_content(ref, *, description=None):
    schema = {"$ref": f"#/components/schemas/{ref}"}
    if description:
        schema = {"allOf": [schema], "description": description}
    return {"content": {"application/json": {"schema": schema}}}


def _operation(
    *,
    operation_id,
    summary,
    description,
    request_ref=None,
    success_ref="HeadlessAuthResponse",
):
    operation = {
        "operationId": operation_id,
        "tags": [_TAG],
        "summary": summary,
        "description": description,
        "responses": {
            "200": {
                "description": "Success.",
                "content": {
                    "application/json": {
                        "schema": {"$ref": f"#/components/schemas/{success_ref}"}
                    }
                },
            },
            "400": {
                "description": "Validation error (allauth `{status, errors}`).",
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/HeadlessErrorResponse"}
                    }
                },
            },
        },
    }
    if request_ref:
        operation["requestBody"] = _json_content(request_ref)
        operation["requestBody"]["required"] = True
    return operation


_HEADLESS_SCHEMAS = {
    "HeadlessAuthResponse": {
        "type": "object",
        "description": "django-allauth headless envelope. `data` carries "
        "the affected resources (e.g. `user`); `meta` carries out-of-band "
        "values -- for the `app` client this includes the app's SimpleJWT "
        "as `access_token` + `refresh_token`.",
        "properties": {
            "status": {"type": "integer", "example": 200},
            "data": {"type": "object", "additionalProperties": True},
            "meta": {
                "type": "object",
                "additionalProperties": True,
                "description": "`access_token` / `refresh_token` are "
                "present only for `/_allauth/app/v1/...` requests.",
            },
        },
    },
    "HeadlessErrorResponse": {
        "type": "object",
        "properties": {
            "status": {"type": "integer", "example": 400},
            "errors": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string"},
                        "param": {"type": "string", "nullable": True},
                        "message": {"type": "string"},
                    },
                },
            },
        },
    },
    "HeadlessSignupRequest": {
        "type": "object",
        "required": ["email", "password"],
        "properties": {
            "email": {"type": "string", "format": "email"},
            "full_name": {"type": "string"},
            "password": {"type": "string", "format": "password"},
        },
    },
    "HeadlessLoginRequest": {
        "type": "object",
        "required": ["email", "password"],
        "properties": {
            "email": {"type": "string", "format": "email"},
            "password": {"type": "string", "format": "password"},
        },
    },
    "HeadlessVerifyEmailRequest": {
        "type": "object",
        "required": ["key"],
        "properties": {
            "key": {
                "type": "string",
                "description": "The 6-digit code or the link token from "
                "the verification email.",
            },
        },
    },
    "HeadlessRequestPasswordResetRequest": {
        "type": "object",
        "required": ["email"],
        "properties": {"email": {"type": "string", "format": "email"}},
    },
    "HeadlessResetPasswordRequest": {
        "type": "object",
        "required": ["key", "password"],
        "properties": {
            "key": {"type": "string"},
            "password": {"type": "string", "format": "password"},
        },
    },
}


def inject_headless_auth_paths(result, generator, request, public):
    """Add the django-allauth headless `/auth/*` endpoints to the schema.

    Documented for both clients. The only client-specific difference is the
    token delivery in `meta`: the `app` client (native/mobile) receives the
    app's SimpleJWT as `meta.access_token` / `meta.refresh_token`, whereas the
    `browser` client relies on allauth's session cookie and receives neither
    (see apps/accounts/headless.py, `SimpleJWTTokenStrategy`).
    """
    # Register the helper schemas in the generator's component registry rather
    # than writing straight into result["components"]["schemas"]. drf-
    # spectacular's own enum hook (drf_spectacular.hooks.postprocess_schema_enums)
    # REBUILDS result["components"] from this registry, so anything inserted
    # directly into the result after that hook runs -- or before it, without
    # being registered -- is silently discarded.
    for name, schema in _HEADLESS_SCHEMAS.items():
        generator.registry.register(
            ResolvedComponent(
                name=name,
                type=ResolvedComponent.SCHEMA,
                schema=schema,
                object=name,
            )
        )

    paths = result.setdefault("paths", {})
    endpoint_specs = {
        "signup": ("HeadlessSignupRequest", "Create an account (unified, all roles)."),
        "login": ("HeadlessLoginRequest", "Authenticate; `data.user` carries the role."),
        "email/verify": (
            "HeadlessVerifyEmailRequest",
            "Verify an email with the 6-digit code or emailed link token.",
        ),
        "email/verify/resend": (None, "Resend the verification email/code."),
        "password/request": (
            "HeadlessRequestPasswordResetRequest",
            "Request a password-reset email (code + link).",
        ),
        "password/reset": (
            "HeadlessResetPasswordRequest",
            "Complete a password reset with the code or link token.",
        ),
    }

    for client in _HEADLESS_CLIENTS:
        for endpoint, (request_ref, summary) in endpoint_specs.items():
            path = f"/_allauth/{client}/v1/auth/{endpoint}"
            token_note = (
                "`meta.access_token` and `meta.refresh_token` carry the app's "
                "SimpleJWT."
                if client == "app"
                else "The browser client authenticates via allauth's session "
                "cookie; no tokens are returned here."
            )
            paths[path] = {
                "post": _operation(
                    operation_id=f"headless_{client}_{endpoint.replace('/', '_')}",
                    summary=f"{summary} [{client} client]",
                    description=(
                        f"django-allauth headless endpoint ({client} client). "
                        f"{token_note}"
                    ),
                    request_ref=request_ref,
                )
            }

    return result
