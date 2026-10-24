export const API_BASE_URL = 'http://localhost:8080';

export const ROLES = {
  VISITOR: 'VISITOR',
  CASHIER: 'CASHIER',
  MUSEUM_MANAGER: 'MUSEUM_MANAGER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
} as const;

export type Role = keyof typeof ROLES;

export interface UserSettings {
  language?: string;
  requireAuth?: boolean;
  viaVoucherUrl?: string;
  paystackCheckoutUrl?: string;
  flutterwaveCheckoutUrl?: string;
  voucherDownloadUrl?: string;
  centerTicketFid?: string;
  cardBasePriceEtb?: string;
  sideFeeA?: string;
  sideFeeB?: string;
}
