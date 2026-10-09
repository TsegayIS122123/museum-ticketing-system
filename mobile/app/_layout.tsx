import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/i18n';
import { AuthProvider } from '@/auth/AuthProvider';
import { initDatabase } from '@/database';
import { OfflineBanner } from '@/features/shared/OfflineBanner';
import { SyncProvider } from '@/features/cashier/offline/SyncProvider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  useEffect(() => {
    initDatabase().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SyncProvider>
            <OfflineBanner />
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="auto" />
          </SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
