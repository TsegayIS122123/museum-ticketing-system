"""
catalog -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Per Design Spec Sec 6.2: the active-category list is small, read-heavy,
and rarely written to, so it's cached (Redis DB 1, the `default` cache
alias -- config/settings/base.py `CACHES`) and invalidated on write, never
left to a fixed TTL, so a Visitor is never quoted a stale price.

Authorization (Museum-Manager-only for create/update/retire, FR-CAT-002)
is the view layer's job (permission classes), not this module's --
services assume the caller has already been authorized, mirroring
accounts/services.py's own division of labor.
"""

from django.core.cache import cache

from .models import Category

# Sec 6.2: one cache key for the whole active-category list rather than a
# per-category key, since the entire list (a handful of rows) is what
# GET /categories reads on every request.
ACTIVE_CATEGORIES_CACHE_KEY = "catalog:categories:active"


def _invalidate_active_categories_cache():
    cache.delete(ACTIVE_CATEGORIES_CACHE_KEY)


def list_active_categories():
    """Implements FR-CAT-001 -- the list `GET /categories` (public,
    unauthenticated) serves. Retired categories (Sec 3.2 `active=False`)
    never appear here; they still exist for `booking` FK integrity."""
    categories = cache.get(ACTIVE_CATEGORIES_CACHE_KEY)
    if categories is None:
        categories = list(Category.objects.filter(active=True))
        cache.set(ACTIVE_CATEGORIES_CACHE_KEY, categories)
    return categories


def create_category(*, name_en, name_am, price_etb, is_free=False):
    """Implements FR-CAT-002's creation path."""
    category = Category.objects.create(
        name_en=name_en,
        name_am=name_am,
        price_etb=price_etb,
        is_free=is_free,
    )
    _invalidate_active_categories_cache()
    return category


def update_category(
    *, category, name_en=None, name_am=None, price_etb=None, is_free=None, active=None
):
    """Implements FR-CAT-002's edit path -- price and bilingual name may be
    changed freely; per FR-CAT-002 this never touches an already-issued
    ticket, since a `booking` row (once `apps.bookings` exists) snapshots
    its own copy of these fields at creation time rather than reading this
    row live."""
    if name_en is not None:
        category.name_en = name_en
    if name_am is not None:
        category.name_am = name_am
    if price_etb is not None:
        category.price_etb = price_etb
    if is_free is not None:
        category.is_free = is_free
    if active is not None:
        category.active = active
    category.save()
    _invalidate_active_categories_cache()
    return category


def retire_category(*, category):
    """Implements FR-CAT-002's retirement path (`DELETE /categories/{id}`)
    -- a soft delete only (`active=False`); Section 1.3's no-physical-
    delete convention applies here too, since a `booking` row's FK to this
    category (`ON DELETE RESTRICT`, Document 05 Sec 3.3) must keep
    resolving even after retirement."""
    category.active = False
    category.save(update_fields=["active", "updated_at"])
    _invalidate_active_categories_cache()
    return category
