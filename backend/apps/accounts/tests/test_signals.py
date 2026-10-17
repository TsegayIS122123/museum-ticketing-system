"""
Tests for apps/accounts/signals.py -- keeping Account.email_verified_at in
sync with django-allauth's EmailAddress.verified (the booking gate and the
API read Account.email_verified_at, not EmailAddress, so this sync is what
makes allauth's verification actually visible to the rest of the app).
"""

from datetime import timedelta

import pytest
from allauth.account.models import EmailAddress
from allauth.account.signals import email_confirmed
from django.utils import timezone

from apps.accounts.models import Account

pytestmark = pytest.mark.django_db


def _make(email="sig@example.com"):
    account = Account(email=email, full_name="Signal Test")
    account.set_password("a-strong-password-1")
    account.save()
    return account


def test_email_confirmed_sets_email_verified_at():
    account = _make()
    email_address = EmailAddress.objects.create(
        user=account, email=account.email, primary=True, verified=False
    )
    assert account.email_verified_at is None

    email_confirmed.send(sender=EmailAddress, request=None, email_address=email_address)

    account.refresh_from_db()
    assert account.email_verified_at is not None


def test_email_confirmed_does_not_overwrite_an_existing_timestamp():
    account = _make()
    original = timezone.now() - timedelta(days=1)
    Account.objects.filter(pk=account.pk).update(email_verified_at=original)
    account.refresh_from_db()
    email_address = EmailAddress.objects.create(
        user=account, email=account.email, primary=True, verified=True
    )

    email_confirmed.send(sender=EmailAddress, request=None, email_address=email_address)

    account.refresh_from_db()
    assert account.email_verified_at == original
