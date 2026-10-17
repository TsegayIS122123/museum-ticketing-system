export const ROLES = {
  VISITOR: 'visitor',
  CASHIER: 'cashier',
  MUSEUM_MANAGER: 'museum_manager',
  PLATFORM_ADMIN: 'platform_admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const BOOKING_STATUSES = [
  'awaiting_payment',
  'pending',
  'visited',
  'cancelled',
  'refunded',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
