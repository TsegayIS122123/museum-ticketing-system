import { apiClient } from '@/lib/api/client';

export interface PendingBooking {
  id: string;
  reference: string;
  visitorName: string;
  visitDate: string;
  bookedQuantity: number;
  attendedQuantity: number;
  totalAmountEtb: number;
  categoryNameEn: string;
  categoryNameAm: string;
  checkedInAt: string;
}

export interface SettlementTransfer {
  id: string;
  amountEtb: number;
  bookingIds: string[];
  referenceNumber: string;
  receiptUrl: string;
  initiatedByUserId: string;
  initiatedByName: string;
  createdAt: string;
  status: 'processing' | 'completed' | 'failed';
}

export interface SettlementSummary {
  totalBookings: number;
  totalAmount: number;
  refundsDeducted: number;
  netAmount: number;
}

// Get all visited bookings not yet settled
export async function getPendingSettlement(): Promise<PendingBooking[]> {
  return apiClient.get<PendingBooking[]>('/settlement/pending');
}

// Get settlement summary (totals before transfer)
export async function getSettlementSummary(): Promise<SettlementSummary> {
  return apiClient.get<SettlementSummary>('/settlement/summary');
}

// Create a settlement transfer (batched)
export async function createSettlementTransfer(): Promise<SettlementTransfer> {
  return apiClient.post<SettlementTransfer>('/settlement/transfers');
}

// Get settlement transfer history
export async function getSettlementTransfers(): Promise<SettlementTransfer[]> {
  return apiClient.get<SettlementTransfer[]>('/settlement/transfers');
}

// Get a specific settlement transfer
export async function getSettlementTransfer(id: string): Promise<SettlementTransfer> {
  return apiClient.get<SettlementTransfer>(`/settlement/transfers/${id}`);
}
