import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { formatEtb } from '@/utils/money';
import { useInstitutionsReport } from '@/api/queries/admin-reports';

export function InstitutionsTab({ from, to }: { from?: string; to?: string }) {
  const { t } = useTranslation();
  const q = useInstitutionsReport(from, to);

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (q.isError || !q.data) return <View style={styles.center}><Text style={styles.err}>{t('admin_reports_error', 'Could not load report')}</Text></View>;

  if (q.data.data.length === 0) {
    return <View style={styles.center}><Text style={styles.empty}>{t('admin_reports_empty', 'Nothing to show')}</Text></View>;
  }

  return (
    <FlatList
      data={q.data.data}
      keyExtractor={(r) => r.institutionId ?? r.name}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            TIN {item.tin ?? '—'} · {item.visitCount} visits · {item.attendedTotal}/{item.bookedTotal} attended
          </Text>
          <Text style={styles.meta}>
            {formatEtb(item.revenueEtb)} · {item.firstVisit} → {item.lastVisit}
          </Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  card: { gap: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  err: { color: colors.danger, fontFamily: typography.fontFamily.latin },
  empty: { color: colors.textMuted, fontFamily: typography.fontFamily.latin },
  name: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.md, fontWeight: '600', color: colors.text },
  meta: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.textMuted },
});
