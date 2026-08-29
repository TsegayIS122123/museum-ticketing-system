// Temporary mock for testing - remove when backend is ready
export const MOCK_USERS = {
  visitor: {
    id: 'visitor-1',
    email: 'visitor@example.com',
    phone: '+251912345678',
    fullName: 'Test Visitor',
    role: 'visitor' as const,
    languagePreference: 'en' as const,
    active: true,
  },
  cashier: {
    id: 'cashier-1',
    email: 'cashier@museum.et',
    phone: '+251912345678',
    fullName: 'Test Cashier',
    role: 'cashier' as const,
    languagePreference: 'en' as const,
    active: true,
  },
  manager: {
    id: 'manager-1',
    email: 'manager@museum.et',
    phone: '+251912345678',
    fullName: 'Test Manager',
    role: 'museum_manager' as const,
    languagePreference: 'en' as const,
    active: true,
  },
  admin: {
    id: 'admin-1',
    email: 'admin@museum.et',
    phone: '+251912345678',
    fullName: 'Test Admin',
    role: 'platform_admin' as const,
    languagePreference: 'en' as const,
    active: true,
  },
};
