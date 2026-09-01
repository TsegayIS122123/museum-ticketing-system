"""
core -- pagination

Document 04's list responses (e.g. `PaginatedCategories`) share one
envelope shape: `{"data": [...], "meta": {"limit", "offset", "total"}}` --
not DRF's own `count`/`next`/`previous`/`results` shape. This is the one
pagination class every list endpoint in the API uses (wired in as
`DEFAULT_PAGINATION_CLASS`, config/settings/base.py), so every client (Web,
Mobile) parses the same envelope regardless of which resource it's listing.
"""

from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response


class EnvelopeLimitOffsetPagination(LimitOffsetPagination):
    default_limit = 20
    max_limit = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "data": data,
                "meta": {
                    "limit": self.limit,
                    "offset": self.offset,
                    "total": self.count,
                },
            }
        )

    def get_paginated_response_schema(self, schema):
        # FIXED (contract audit, see PaginatedAccountList/PaginatedBookingList/
        # PaginatedCashierReconciliationList/PaginatedCategoryList/
        # PaginatedRefundList in contracts/openapi.yaml): the previous version
        # of this method wrapped `schema` in *another* array
        # (`{"type": "array", "items": schema}`) before putting it under
        # `data`. That was wrong, not a drf-spectacular bug: drf-spectacular's
        # `_get_response_for_code` already calls `build_array_type(schema)`
        # -- i.e. wraps the bare item schema in an array -- before it ever
        # calls this method, so the `schema` argument received here is
        # already `{"type": "array", "items": <item schema>}`. Wrapping it
        # again produced a genuinely doubly-nested `data: [[schema]]` in the
        # exported contract, which a fresh `manage.py spectacular` run
        # reproduces byte-for-byte -- this was never just a documentation
        # artifact of an old drf-spectacular version. The runtime response
        # (`get_paginated_response` above) has always been a flat array;
        # `schema` here already matches that shape, so it's used as-is.
        return {
            "type": "object",
            "properties": {
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer"},
                        "offset": {"type": "integer"},
                        "total": {"type": "integer"},
                    },
                },
            },
        }
