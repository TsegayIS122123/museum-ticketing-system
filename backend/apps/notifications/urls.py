from rest_framework.routers import DefaultRouter

app_name = "notifications"
router = DefaultRouter()
# No entries: `notifications` has no HTTP endpoints per `contracts/openapi.yaml`
# -- see views.py's docstring. Kept as an (empty) router so `config/urls.py`'s
# `include("apps.notifications.urls")` continues to work unchanged if that
# ever changes.

urlpatterns = router.urls
