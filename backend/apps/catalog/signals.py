"""
catalog -- signals

`services.list_active_categories`'s cache (Sec 6.2) is documented as
"invalidated on write ... never left to a fixed TTL" -- but until now
that was only actually true for writes that went through
`create_category`/`update_category`/`retire_category`, each of which
called `_invalidate_active_categories_cache()` itself. Any other write
path bypassed that entirely and left the cached list stale:

- `apps.catalog.admin.CategoryAdmin` is a plain `admin.ModelAdmin` (see
  its own module docstring for why it's deliberately left this way --
  there's no OTP/token-issuing provisioning flow for it to bypass, unlike
  `accounts.admin`), so a Museum Manager adding, editing, or reactivating
  a category from Django Admin calls `Category.save()` directly and
  never touches `services.py` at all.
- So does a `manage.py shell`/`shell_plus` one-off, or a future data
  migration that touches this table directly.

The practical symptom: a category created or reactivated through Admin
looks perfectly correct in the database (`active=True`, right name/price)
but silently doesn't show up anywhere `GET /categories` is read from
(e.g. the Cashier's category-correction/add-item pickers) until the
cache's default 5-minute timeout happens to expire on its own.

Connecting to `post_save`/`post_delete` here -- rather than only calling
`_invalidate_active_categories_cache()` from the three service functions
-- makes the "invalidated on write" promise true regardless of what
wrote the row. `post_delete` is included even though `Category` rows are
never hard-deleted in production (Sec 1.3's no-physical-delete
convention) because nothing stops a test, a fixture teardown, or a
future admin action from doing so, and a hard delete should invalidate
the cache too.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Category
from .services import _invalidate_active_categories_cache


@receiver(post_save, sender=Category)
@receiver(post_delete, sender=Category)
def invalidate_active_categories_cache_on_write(sender, **kwargs):
    _invalidate_active_categories_cache()
