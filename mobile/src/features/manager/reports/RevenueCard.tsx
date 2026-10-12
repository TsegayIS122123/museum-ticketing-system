import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';
import { formatEtb, toNumber } from '@/utils/money';

/**
 * Money arrives from `/reports/*` as decimal strings, so both props accept
 * either spelling and are parsed for display only -- `formatEtb` for the
 * figures, `toNumber` for the bar widths. Calling `.toFixed()` straight on
 * a string (what this did before) is a TypeError at runtime; the React
 * error boundary, not the type system, is what used to catch it.
 */
export function RevenueCard({
  total,
  byCategory,
}: {
  total: string | number;
  byCategory: Record<string, string | number>;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(byCategory).map(
    ([name, value]) => [name, toNumber(value)] as const
  );
  const maxValue = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <View style={styles.wrap}>
      <Text style={styles.total}>{formatEtb(total)}</Text>
      <Text style={styles.label}>{t('totalRevenue', 'Total revenue')}</Text>
      <View style={styles.bars}>
        {entries.map(([name, v]) => (
          <View key={name} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[styles.barFill, { width: `${(v / maxValue) * 100}%` }]}
              />
            </View>
            <Text style={styles.value}>{formatEtb(v)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  total: { fontSize: typography.sizes.xxl, fontWeight: '700', color: colors.brandPrimary },
  label: { fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' },
  bars: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { width: 90, fontSize: typography.sizes.xs, color: colors.text },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4 },
  barFill: { height: 8, backgroundColor: colors.brandPrimary, borderRadius: 4 },
  value: { width: 80, textAlign: 'right', fontSize: typography.sizes.xs, color: colors.textMuted },
});
