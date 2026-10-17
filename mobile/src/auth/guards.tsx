import { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from './useAuth';
import { ROLES, type Role } from '@/constants/config';

const HOME_BY_ROLE: Record<Role, string> = {
  [ROLES.VISITOR]: '/(visitor)',
  [ROLES.CASHIER]: '/(cashier)',
  [ROLES.MUSEUM_MANAGER]: '/(manager)',
  [ROLES.PLATFORM_ADMIN]: '/(admin)',
};

export function homeForRole(role: Role): string {
  return HOME_BY_ROLE[role] ?? '/(auth)/sign-in';
}

export function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (user.role !== role) return <Redirect href={homeForRole(user.role) as any} />;
  return <>{children}</>;
}
