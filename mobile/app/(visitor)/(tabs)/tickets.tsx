import { BookingList } from '@/features/visitor/tickets/BookingList';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

// The visitor home is public, so each screen that needs an account carries its
// own guard: a signed-out visitor is sent to the single sign-in front door
// instead of seeing an empty ticket list.
export default function TicketsTab() {
  return (
    <RequireRole role={ROLES.VISITOR}>
      <BookingList />
    </RequireRole>
  );
}
