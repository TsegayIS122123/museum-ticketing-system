import { Stack } from 'expo-router';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';

export default function VisitorLayout() {
  return (
    <RequireRole role={ROLES.VISITOR}>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireRole>
  );
}
