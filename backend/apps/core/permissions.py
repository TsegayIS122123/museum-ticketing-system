"""
core.permissions -- shared DRF permission classes

Per Design Spec Sec 4 and Document 01 Sec 4: four fixed roles -- Visitor,
Cashier, Museum Manager, Platform Admin -- checked against a `role` field
on apps.accounts.Account, never against a raw JWT claim (mirrors the
"resolve against the account, not the token" discipline used elsewhere).

Per ADR-004 there is no scope_type/scope_id to resolve against (single
venue) -- these are flat role checks only, unlike a multi-tenant project.
"""

from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "platform_admin"
        )


class IsMuseumManager(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "museum_manager"
        )


class IsCashier(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "cashier"
        )


class IsStaff(BasePermission):
    """Any of Cashier / Museum Manager / Platform Admin -- i.e. not a Visitor."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None)
            in {"cashier", "museum_manager", "platform_admin"}
        )


class IsVisitor(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "visitor"
        )
