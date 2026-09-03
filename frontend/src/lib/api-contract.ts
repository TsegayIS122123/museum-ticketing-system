/**
 * Thin derived-type layer on top of `api-types.ts` (generated straight
 * from `contracts/openapi.yaml` -- never hand-edit that file).
 *
 * Every type below is either:
 *   (a) a direct re-export of a generated `components["schemas"][...]`
 *       type, so a future contract change is a compile error at every
 *       call site, or
 *   (b) a small `Omit<...> & {...}` / `Pick<...>` on top of a generated
 *       type, for the handful of places where the contract itself is
 *       verified to be looser or wrong relative to the real backend
 *       (documented inline, with the backend source that was checked).
 *
 * Nothing here re-declares a schema's fields by hand -- if the contract
 * adds/removes/renames a field, every one of these still narrows/derives
 * from the generated type and so still catches the change at compile time.
 */
import type { components } from './api-types';

// ---------------------------------------------------------------------
// Booking.bookingType / Booking.approvalStatus
//
// apps/bookings/serializers.py's BookingSerializer declares both as
// plain `serializers.CharField(read_only=True)`, not `ChoiceField`, so
// drf-spectacular has no way to see the model's real `choices` and the
// generated schema types both as bare `string`. The underlying model
// (apps/bookings/models.py) has real TextChoices enums though:
//   BookingType:      individual | group
//   ApprovalStatus:   pending | approved | declined
// `pending` is genuinely reachable -- apps/bookings/services.py line 172
// sets `approval_status=Booking.ApprovalStatus.PENDING if is_group else
// None` on every new group booking. There's no generated
// `ApprovalStatusEnum` to import (spectacular never saw the choices), so
// the literal union here is hand-written -- but everything else about
// `Booking` still comes from the generated schema, so any other field
// changing is still a compile error.
// ---------------------------------------------------------------------
export type BookingTypeValue = components['schemas']['BookingTypeEnum'];
export type ApprovalStatusValue = 'pending' | 'approved' | 'declined';

type TightenBooking<T> = Omit<T, 'bookingType' | 'approvalStatus'> & {
  readonly bookingType: BookingTypeValue;
  readonly approvalStatus: ApprovalStatusValue | null;
};

export type Booking = TightenBooking<components['schemas']['Booking']>;

// CheckInResponse (POST /bookings/{id}/check-in) is Booking's fields plus
// four IFMIS voucher-prep fields -- same bookingType/approvalStatus
// looseness, same fix.
export type CheckInResponse = TightenBooking<components['schemas']['CheckInResponse']>;

// PaginatedBookingList.data still points at the raw (loose) generated
// `Booking` schema, not the tightened one above -- every list endpoint
// that returns bookings (GET /users/me/bookings/, GET /bookings, etc.)
// needs the tightened element type too, or the enum-narrowing above is
// lost the moment a caller reads a list instead of a single booking.
export type BookingListResponse = Omit<components['schemas']['PaginatedBookingList'], 'data'> & {
  data: Booking[];
};

// ReportSummary.from used to disagree with the generated `from_` (the
// backend renamed the field in `to_representation`, invisible to
// drf-spectacular). Fixed at the source: apps/reporting/serializers.py's
// ReportSummarySerializer now renames the field in `get_fields()`
// instead, so DRF's own field-name binding -- which drf-spectacular
// reads too -- says `from` everywhere. No override needed here anymore;
// `components["schemas"]["ReportSummary"]` is used directly.
export type ReportSummary = components['schemas']['ReportSummary'];

// ---------------------------------------------------------------------
// POST /auth/refresh/ takes no request body at all -- the refresh token
// travels as the httpOnly cookie apps.accounts.cookies sets on
// login/verify, never as a JSON field (lib/api/client.ts's
// refreshAccessToken()). Response is just the new access token; the
// rotated refresh token comes back as a Set-Cookie the browser stores on
// its own, not in this JSON, so there's no `refresh` field to type here
// either.
// ---------------------------------------------------------------------
export type TokenRefreshResponse = components['schemas']['TokenRefreshResponse'];

// POST /admin/staff/'s response used to be mistyped as `StaffCreate`
// (missing id/active/created_at) instead of `Account`, because
// drf-spectacular resolves each operation from the view's actual
// HTTP-verb handler method (`post`, inherited un-overridden from
// `ListCreateAPIView`), not from `create()`, which is what the
// `@extend_schema` override used to sit on. Fixed at the source:
// apps/platform_admin/views.py now attaches the override via
// `@extend_schema_view(post=extend_schema(...))` at the class level,
// where spectacular actually looks. No override needed here anymore;
// `components["schemas"]["Account"]` is used directly, same as every
// other place `Account` appears.
export type StaffAccountResponse = components['schemas']['Account'];
