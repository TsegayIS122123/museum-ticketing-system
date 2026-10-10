import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { useDashboard, useSummary } from '@/api/queries/manager-dashboard';
import { RevenueCard } from './RevenueCard';
import { StatusMixCard } from './StatusMixCard';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function ReportsScreen() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('daily');
  const { data: dash, isLoading, isError, refetch } = useDashboard();
  const { data: summary, isLoading: loadingSummary } = useSummary(period);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError || !dash) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
        </View>
      </Screen>
    );
  }

  const revenue =
    typeof dash.revenueTotalEtb === 'string'
      ? parseFloat(dash.revenueTotalEtb)
      : dash.revenueTotalEtb;

  const periods: { value: Period; label: string }[] = [
    { value: 'daily', label: t('daily', 'Daily') },
    { value: 'weekly', label: t('weekly', 'Weekly') },
    { value: 'monthly', label: t('monthly', 'Monthly') },
    { value: 'yearly', label: t('yearly', 'Yearly') },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('reports', 'Reports')}</Text>

        <View style={styles.pills}>
          {periods.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => setPeriod(p.value)}
              style={[styles.pill, period === p.value && styles.pillActive]}
            >
              <Text style={[styles.pillText, period === p.value && styles.pillTextActive]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Card>
          <RevenueCard
            total={revenue}
            byCategory={
              summary?.revenueByCategory ??
              Object.fromEntries(
                Object.entries(dash.visitorCountsByCategory ?? {}).map(([k, v]) => [
                  k,
                  (v ?? 0) * 100,
                ])
              )
            }
          />
        </Card>

        {dash.statusMix ? (
          <Card>
            <StatusMixCard mix={dash.statusMix} />
          </Card>
        ) : null}

        {dash.visitorCountsByCategory ? (
          <Card>
            <CategoryBreakdownCard counts={dash.visitorCountsByCategory} />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  pills: { flexDirection: 'row', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pillText: { fontSize: typography.sizes.sm, color: colors.text },
  pillTextActive: { color: colors.textInverse, fontWeight: '700' },
  error: { color: colors.danger },
});
