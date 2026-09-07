from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.catalog"
    label = "catalog"

    def ready(self):
        # Registers the post_save/post_delete cache-invalidation receiver
        # -- see signals.py's own module docstring for why this can't
        # just live in services.py alone (Django Admin bypasses it).
        from . import signals  # noqa: F401
