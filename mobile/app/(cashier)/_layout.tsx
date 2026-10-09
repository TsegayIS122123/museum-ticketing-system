import { Stack } from 'expo-router';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

export default function CashierLayout() {
  return (
    <RequireRole role={ROLES.CASHIER}>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireRole>
  );
}
