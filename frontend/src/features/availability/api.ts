import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';

export type DateAvailability = components['schemas']['DateAvailability'];

// GET /availability/?from=YYYY-MM-DD&to=YYYY-MM-DD -- both query params
// are REQUIRED by the backend (returns 400 if either is missing), even
// though the generated contract doesn't document them as parameters --
// the view's @extend_schema never declared `parameters=` (same class of
// bug as /reports/summary/'s period param). Only dates with an explicit
// record come back; any date not returned defaults to open.
export async function getAvailability(from: string, to: string): Promise<DateAvailability[]> {
  const query = new URLSearchParams({ from, to });
  return apiClient.get<DateAvailability[]>(`/availability/?${query.toString()}`);
}

// PUT /availability/{date}/ -- Museum Manager only
export async function updateAvailability(date: string, isOpenForBooking: boolean): Promise<DateAvailability> {
  return apiClient.put<DateAvailability>(`/availability/${date}/`, { isOpenForBooking });
}
