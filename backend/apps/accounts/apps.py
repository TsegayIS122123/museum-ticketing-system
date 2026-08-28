from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"

    def ready(self):
        # Registers the TokenVersionAuthentication schema extension with
        # drf-spectacular -- see schema.py for why this is needed. Must be
        # imported somewhere for the extension's metaclass registration to
        # run; ready() is the standard place for that kind of side effect.
        from . import schema  # noqa: F401