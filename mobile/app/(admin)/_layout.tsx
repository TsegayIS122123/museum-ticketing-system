import { Stack } from 'expo-router';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

export default function AdminLayout() {
  return (
    <RequireRole role={ROLES.PLATFORM_ADMIN}>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireRole>
  );
}
