import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';

export function StatusMixCard({
  mix,
}: {
  mix: { pending: number; visited: number; cancelled: number; refunded: number };
}) {
  const { t } = useTranslation();
  const total = mix.pending + mix.visited + mix.cancelled + mix.refunded || 1;

  const rows = [
    { key: 'pending', label: t('pending', 'Pending'), color: '#1E40AF' },
    { key: 'visited', label: t('visited', 'Visited'), color: '#065F46' },
    { key: 'cancelled', label: t('cancelled', 'Cancelled'), color: '#374151' },
    { key: 'refunded', label: t('refunded', 'Refunded'), color: '#991B1B' },
  ] as const;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('statusMix', 'Status mix')}</Text>
      <View style={styles.bar}>
        {rows.map((r) => (
          <View
            key={r.key}
            style={[styles.segment, { flex: mix[r.key], backgroundColor: r.color }]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {rows.map((r) => (
          <View key={r.key} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: r.color }]} />
            <Text style={styles.legendLabel}>{r.label}</Text>
            <Text style={styles.legendValue}>{mix[r.key]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  title: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  segment: { height: 12 },
  legend: { gap: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: typography.sizes.sm, color: colors.text },
  legendValue: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.text },
});
