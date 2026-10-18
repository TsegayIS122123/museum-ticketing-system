import { BookingWizard } from '@/features/visitor/book/BookingWizard';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

// Bookings belong to a signed-in (and email-verified) visitor -- the wizard
// creates one against the authenticated account. The guard lives here, next to
// the screen, because the visitor layout itself is public now.
export default function NewBookingScreen() {
  return (
    <RequireRole role={ROLES.VISITOR}>
      <BookingWizard />
    </RequireRole>
  );
}
