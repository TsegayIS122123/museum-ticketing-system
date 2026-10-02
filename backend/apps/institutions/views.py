"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes (Design Spec Sec 3.1). No business logic here.

No explicit `permission_classes` on the one view below -- the project's
`DEFAULT_PERMISSION_CLASSES` (`IsAuthenticated`) already applies, same as
`apps.catalog`'s own read endpoints: this is a plain authenticated-only
lookup, not staff-restricted -- the Visitor filling in the group-visit
form is exactly who needs it.
"""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import InstitutionSerializer


class InstitutionLookupView(APIView):
    """GET /institutions/?tin={tin} (UAT round 1).

    The group-visit-request form's autofill: as a booker types a TIN
    that matches an institution already on file, this fills the name
    field in for them rather than trusting a fresh, possibly
    inconsistent spelling every time (see `services.resolve_institution`'s
    own docstring for the write-time half of this).

    Returns `{"institution": null}` for a TIN that isn't on file yet --
    that's the expected, common case for a school's first-ever booking,
    not an error -- rather than 404.

    Throttled (`institution-lookup`) so the endpoint can't be used to
    enumerate TINs and harvest school names.
    """

    throttle_scope = "institution-lookup"

    @extend_schema(
        operation_id="lookupInstitution",
        parameters=[
            OpenApiParameter(name="tin", type=str, required=True, location="query"),
        ],
        responses={200: InstitutionSerializer},
    )
    def get(self, request):
        tin = request.query_params.get("tin", "")
        institution = services.find_institution_by_tin(tin=tin)
        return Response(
            {"institution": InstitutionSerializer(institution).data if institution else None}
        )
