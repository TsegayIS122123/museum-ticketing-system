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

// ---------------------------------------------------------------------
// ReportSummary.from_ vs the real wire field `from`
//
// apps/reporting/serializers.py can't name a field `from` (Python
// keyword), so it declares `from_ = serializers.DateField(source="from")`
// and then overrides `to_representation` to rename the output key back
// to `"from"` before it's ever sent. drf-spectacular has no visibility
// into that manual rename, so the generated schema says `from_` -- but
// the real JSON key on the wire is `from`. Flagged for a backend fix
// (a manual schema field annotation), not fixable on the frontend beyond
// this override.
// ---------------------------------------------------------------------
export type ReportSummary = Omit<components['schemas']['ReportSummary'], 'from_'> & {
  from: string;
};

// ---------------------------------------------------------------------
// TokenRefresh is one shared schema for both directions of
// POST /auth/refresh/, which doesn't cleanly fit either as-is:
//   request:  { refresh: string }              (only `refresh` is sent)
//   response: { readonly access, refresh }      (both come back)
// Deriving via Pick/the full type instead of hand-writing either.
// ---------------------------------------------------------------------
export type TokenRefreshRequest = Pick<components['schemas']['TokenRefresh'], 'refresh'>;
export type TokenRefreshResponse = components['schemas']['TokenRefresh'];

// ---------------------------------------------------------------------
// POST /admin/staff/ response schema bug
//
// apps/platform_admin/views.py's StaffListCreateView.create() has
// `@extend_schema(request=StaffCreateSerializer, responses=AccountSerializer)`
// and its runtime body is genuinely `Response(AccountSerializer(account).data, ...)`.
// But `get_serializer_class()` overrides to `StaffCreateSerializer` for
// POST, and drf-spectacular's schema resolution for this
// `ListCreateAPIView` picks that up instead of honoring the
// `@extend_schema` override -- so `api-types.ts`'s
// `operations["v1_admin_staff_create"]["responses"][201]` is typed as
// `StaffCreate` (email/phone/full_name/role only -- missing
// id/active/created_at), not `Account`. Flagged for a backend/
// drf-spectacular fix (restructure the view so schema resolution isn't
// ambiguous, or add an explicit `@extend_schema` on the whole class).
// Typed here via the schema directly, bypassing the operation's own
// (buggy) declared response type.
// ---------------------------------------------------------------------
export type StaffAccountResponse = components['schemas']['Account'];
