"""
accounts -- allauth signal receivers.

django-allauth owns email verification (it flips `EmailAddress.verified`),
but the rest of this codebase gates on `Account.email_verified_at` -- e.g.
`apps.bookings.services.create_booking` refuses an online booking until the
email is verified, and `AccountSerializer` exposes it to the clients. This
receiver keeps that field in sync with allauth's source of truth so nothing
downstream has to query `EmailAddress` itself.
"""

from django.dispatch import receiver
from django.utils import timezone
from allauth.account.signals import email_confirmed


@receiver(email_confirmed)
def mark_account_email_verified(request, email_address, **kwargs):
    """Set `email_verified_at` when allauth confirms an email address. This
    fires for both the 6-digit code and the emailed link, and on both the
    headless browser and app clients -- so it is the one place that owns the
    timestamp."""
    account = email_address.user
    if account is None:
        return
    if account.email_verified_at is None:
        account.email_verified_at = timezone.now()
        account.save(update_fields=["email_verified_at"])
