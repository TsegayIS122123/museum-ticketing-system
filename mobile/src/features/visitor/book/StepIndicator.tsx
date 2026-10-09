import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface StepIndicatorProps {
  steps: string[];
  current: number; // 0-based
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <View style={styles.wrap}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={label} style={styles.item}>
            <View
              style={[
                styles.circle,
                done && styles.circleDone,
                active && styles.circleActive,
              ]}
            >
              <Text
                style={[
                  styles.num,
                  (done || active) && styles.numActive,
                ]}
              >
                {done ? '✓' : i + 1}
              </Text>
            </View>
            <Text
              style={[styles.label, (done || active) && styles.labelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {i < steps.length - 1 ? <View style={styles.connector} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  item: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  circle: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  circleActive: { borderColor: colors.brandPrimary },
  num: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  numActive: { color: colors.brandPrimary },
  label: { marginLeft: spacing.sm, fontSize: typography.sizes.xs, color: colors.textMuted, flex: 1 },
  labelActive: { color: colors.text, fontWeight: typography.weights.semibold },
  connector: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: spacing.sm },
});
