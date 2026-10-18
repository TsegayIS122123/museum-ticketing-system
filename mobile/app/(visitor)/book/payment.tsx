import { PaymentScreen } from '@/features/visitor/pay/PaymentScreen';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

// Payment acts on the signed-in visitor's own booking, so it stays behind the
// visitor guard (the layout above no longer enforces it for the whole group).
export default function PaymentRoute() {
  return (
    <RequireRole role={ROLES.VISITOR}>
      <PaymentScreen />
    </RequireRole>
  );
}
