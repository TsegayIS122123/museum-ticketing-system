import importlib

import pytest
from django.test import override_settings
from django.urls import clear_url_caches, resolve, Resolver404


def _reload_urls():
    import config.urls

    clear_url_caches()
    importlib.reload(config.urls)


@pytest.mark.parametrize("debug,enabled,exposed", [(False, False, False), (False, True, True), (True, False, True)])
def test_schema_routes_only_exposed_in_debug_or_when_opted_in(debug, enabled, exposed):
    with override_settings(DEBUG=debug, ENABLE_API_DOCS=enabled, ROOT_URLCONF="config.urls"):
        _reload_urls()
        try:
            resolve("/api/schema/")
            found = True
        except Resolver404:
            found = False
    _reload_urls()
    assert found is exposed
