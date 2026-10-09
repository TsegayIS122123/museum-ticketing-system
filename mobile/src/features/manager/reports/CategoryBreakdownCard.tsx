import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';

export function CategoryBreakdownCard({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(counts);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('visitorCountsByCategory', 'Visitors by category')}</Text>
      {entries.map(([name, v]) => (
        <View key={name} style={styles.row}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.count}>{v}</Text>
          <Text style={styles.pct}>
            {total ? `${Math.round((v / total) * 100)}%` : '0%'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  name: { flex: 1, fontSize: typography.sizes.sm, color: colors.text },
  count: { width: 40, textAlign: 'right', fontSize: typography.sizes.sm, fontWeight: '700', color: colors.text },
  pct: { width: 50, textAlign: 'right', fontSize: typography.sizes.xs, color: colors.textMuted },
});
