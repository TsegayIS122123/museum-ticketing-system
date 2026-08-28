"""
accounts -- JWT authentication

Per ADR-002 / Design Spec Sec 4.1: the access token carries exactly two
claims, `user_id` and `token_version` -- no role claim, since role is
re-checked against the database on every request rather than trusted from
a (possibly stale) token. `token_version` is what makes immediate
revocation possible for an otherwise-stateless JWT: bumping
`Account.token_version` (e.g. on Staff password reset, see services.py)
invalidates every access token issued before that moment, without waiting
out the 15-minute access-token lifetime.

Both classes below are used together: `AccountRefreshToken` stamps the
claim on at mint time, `TokenVersionAuthentication` checks it on every
request. Swap in `apps.accounts.authentication.TokenVersionAuthentication`
for the stock `JWTAuthentication` in `DEFAULT_AUTHENTICATION_CLASSES`
(config/settings/base.py) to enforce this platform-wide.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken


class AccountRefreshToken(RefreshToken):
    """Use this in place of a bare `RefreshToken.for_user(...)` anywhere a
    Visitor or Staff session is minted (accounts/services.py) -- stamping
    `token_version` here is what `TokenVersionAuthentication` checks below.
    `RefreshToken.access_token` copies custom claims onto the access token
    it derives, so this alone is enough to cover both tokens in the pair.
    """

    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)
        token["token_version"] = user.token_version
        return token


class TokenVersionAuthentication(JWTAuthentication):
    """Rejects an otherwise cryptographically-valid access token whose
    `token_version` claim no longer matches the account's current value --
    e.g. immediately after a Staff password reset (Sec 4.1, FR-ACC-006),
    rather than waiting out that token's remaining 15-minute lifetime."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_version = validated_token.get("token_version")
        if token_version is None or token_version != user.token_version:
            raise AuthenticationFailed(
                "This token has been revoked.", code="token_not_valid"
            )
        return user