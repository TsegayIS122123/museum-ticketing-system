import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useDashboard } from '@/api/queries/manager-dashboard';
import { useAuth } from '@/auth/useAuth';

export function ManagerDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data, isLoading, isError, refetch } = useDashboard();

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
        </View>
      </Screen>
    );
  }

  const revenue = typeof data.revenueTotalEtb === 'string'
    ? parseFloat(data.revenueTotalEtb)
    : data.revenueTotalEtb;

  const totalVisitors = Object.values(data.visitorCountsByCategory ?? {}).reduce(
    (a, b) => a + b,
    0
  );
  const groupCount = data.groupVsIndividualSplit?.group ?? 0;
  const individualCount = data.groupVsIndividualSplit?.individual ?? 0;
  const pending = data.statusMix?.pending ?? 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('managerDashboard', 'Dashboard')}</Text>
          <Text style={styles.greeting}>
            {user?.full_name ?? user?.email}
          </Text>
        </View>

        <View style={styles.grid}>
          <StatCard
            label={t('totalRevenue', 'Revenue')}
            value={`ETB ${revenue.toFixed(2)}`}
            color="green"
          />
          <StatCard
            label={t('totalVisitors', 'Visitors')}
            value={totalVisitors}
            color="amber"
          />
          <StatCard
            label={t('pendingBookings', 'Pending')}
            value={pending}
            color="blue"
          />
          <StatCard
            label={t('groupVsIndividual', 'Group / Solo')}
            value={`${groupCount} / ${individualCount}`}
            color="slate"
          />
        </View>

        <Card>
          <Text style={styles.sectionTitle}>{t('quickActions', 'Quick actions')}</Text>
          <View style={styles.actions}>
            <Button
              label={t('manageCategories', 'Manage categories')}
              variant="secondary"
              onPress={() => router.push('/(manager)/(tabs)/categories' as any)}
            />
            <Button
              label={t('manageAvailability', 'Manage availability')}
              variant="secondary"
              onPress={() => router.push('/(manager)/(tabs)/availability' as any)}
            />
            <Button
              label={t('viewReports', 'View reports')}
              variant="secondary"
              onPress={() => router.push('/(manager)/(tabs)/reports' as any)}
            />
          </View>
        </Card>

        <Button label={t('signOut', 'Sign out')} variant="secondary" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  header: { marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  greeting: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  actions: { gap: spacing.sm },
  error: { color: colors.danger },
});
