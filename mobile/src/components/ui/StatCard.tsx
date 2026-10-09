import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Card } from './Card';
import { colors, spacing, typography } from '@/theme';

type StatColor = 'slate' | 'amber' | 'green' | 'red' | 'blue';

const COLOR_MAP: Record<StatColor, string> = {
  slate: colors.text,
  amber: colors.brandPrimary,
  green: colors.success,
  red: colors.danger,
  blue: colors.brandPrimary,
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: StatColor;
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  sub,
  color = 'slate',
  style,
}: StatCardProps) {
  return (
    <Card style={[styles.card, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: COLOR_MAP[color] }]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: '45%', minWidth: 140, padding: spacing.md },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: typography.sizes.xxl,
    fontWeight: '700',
  },
  sub: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
