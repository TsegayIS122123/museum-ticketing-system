import { TicketDetail } from '@/features/visitor/tickets/TicketDetail';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

// A booking detail/ticket is the visitor's own data -- guard it locally now
// that the visitor layout is public.
export default function BookingDetailRoute() {
  return (
    <RequireRole role={ROLES.VISITOR}>
      <TicketDetail />
    </RequireRole>
  );
}
