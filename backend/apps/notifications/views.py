"""
HTTP concerns only: routing to a service call, permission checks, and
response status codes. No business logic here (Design Spec Sec 3.1).

Per `contracts/openapi.yaml`: `notifications` has no HTTP endpoints of its
own -- it is triggered exclusively by other apps' services.py enqueuing
`apps.notifications.tasks.send_notification`. There is deliberately no
ViewSet here; see `serializers.py` for the read-only shapes available to
`admin.py` (and to any future Staff-facing endpoint, should the contract
grow one).
"""
