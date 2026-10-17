"""
accounts -- forms

Custom allauth signup form (ACCOUNT_SIGNUP_FORM_CLASS). allauth composes its
own ``SignupForm`` on top of whatever base this class provides
(allauth/account/internal/flows/signup.py:``base_signup_form_class``), so
``full_name`` becomes a signup field alongside allauth's own email/password
pair, and ``signup()`` is invoked once the new Account row exists.

``full_name`` is required: ``Account.full_name`` is NOT NULL and allauth has
no built-in notion of it (models.py).
"""

from django import forms


class AccountSignupForm(forms.Form):
    full_name = forms.CharField(max_length=255, label="Full name")

    def signup(self, request, user):
        user.full_name = self.cleaned_data["full_name"]
        user.save(update_fields=["full_name"])
