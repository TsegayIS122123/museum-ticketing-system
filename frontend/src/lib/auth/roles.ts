export type UserRole = 'visitor' | 'cashier' | 'museum_manager' | 'platform_admin';

export function isStaff(role: UserRole): boolean {
  return role !== 'visitor';
}

export function isCashier(role: UserRole): boolean {
  return role === 'cashier';
}

export function isManager(role: UserRole): boolean {
  return role === 'museum_manager';
}

export function isPlatformAdmin(role: UserRole): boolean {
  return role === 'platform_admin';
}

export function getRoleDisplayName(role: UserRole, t?: (key: string) => string): string {
  const names: Record<UserRole, string> = {
    visitor: 'Visitor',
    cashier: 'Cashier',
    museum_manager: 'Museum Manager',
    platform_admin: 'Platform Admin',
  };
  const keys: Record<UserRole, string> = {
    visitor: 'role_visitor',
    cashier: 'role_cashier',
    museum_manager: 'role_museum_manager',
    platform_admin: 'role_platform_admin',
  };
  return (t && t(keys[role])) || names[role];
}

export function getStaffRoutes(role: UserRole): string[] {
  const baseRoutes = ['/staff/login'];
  
  if (role === 'cashier') {
    return [...baseRoutes, '/staff/gate', '/staff/settlement'];
  }
  
  if (role === 'museum_manager') {
    return [
      ...baseRoutes,
      '/staff/dashboard',
      '/staff/categories',
      '/staff/availability',
      '/staff/refunds',
      '/staff/reports',
    ];
  }
  
  if (role === 'platform_admin') {
    return [...baseRoutes, '/staff/admin/staff'];
  }
  
  return baseRoutes;
}
