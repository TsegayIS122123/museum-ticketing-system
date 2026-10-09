import { Stack } from 'expo-router';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

export default function ManagerLayout() {
  return (
    <RequireRole role={ROLES.MUSEUM_MANAGER}>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireRole>
  );
}
