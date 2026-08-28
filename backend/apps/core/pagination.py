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
        return {
            "type": "object",
            "properties": {
                "data": {"type": "array", "items": schema},
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
