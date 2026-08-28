"""
drf-spectacular extensions for this app.

`TokenVersionAuthentication` subclasses simplejwt's `JWTAuthentication`,
but drf-spectacular only ships a built-in `OpenApiAuthenticationExtension`
for the exact `JWTAuthentication` class -- it does not walk subclasses.
Without this, every view using our authenticator logs "could not resolve
authenticator" and is documented as unauthenticated. Registering our own
extension (imported via AccountsConfig.ready(), see apps.py) fixes that;
the security definition itself is identical to simplejwt's own (Bearer/JWT).
"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class TokenVersionAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.TokenVersionAuthentication"
    name = "TokenVersionAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }