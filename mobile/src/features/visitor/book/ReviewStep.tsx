import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useCategories } from '@/api/queries/catalog';
import { formatEtb, multiplyMoney, addMoney } from '@/utils/money';
import { formatDateOnly } from '@/utils/dates';
import type { CategoryLine } from './CategoryStep';

interface ReviewStepProps {
  lines: CategoryLine[];
  visitDate: string;
  bookingType: 'individual' | 'group';
  onBookingTypeChange: (t: 'individual' | 'group') => void;
  groupName: string;
  onGroupNameChange: (v: string) => void;
  groupTin: string;
  onGroupTinChange: (v: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function ReviewStep({
  lines,
  visitDate,
  bookingType,
  onBookingTypeChange,
  onBack,
  onConfirm,
  isSubmitting,
}: ReviewStepProps) {
  const { t, i18n } = useTranslation();
  const isAm = i18n.language === 'am';
  const { data: categories } = useCategories();

  const byId = useMemo(() => {
    const map = new Map<string, any>();
    (categories ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const total = useMemo(() => {
    let acc = '0.00';
    for (const l of lines) {
      const c = byId.get(l.categoryId);
      if (c) acc = addMoney(acc, multiplyMoney(c.price_etb, l.quantity));
    }
    return acc;
  }, [lines, byId]);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Card>
        <Text style={styles.sectionTitle}>{t('bookingSummary', 'Booking summary')}</Text>

        {lines.map((l) => {
          const c = byId.get(l.categoryId);
          if (!c) return null;
          return (
            <View key={l.categoryId} style={styles.row}>
              <Text style={styles.catName}>
                {isAm ? c.name_am : c.name_en} × {l.quantity}
              </Text>
              <Text style={styles.catAmount}>
                {formatEtb(multiplyMoney(c.price_etb, l.quantity))}
              </Text>
            </View>
          );
        })}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>{t('visitDate', 'Visit date')}</Text>
          <Text style={styles.value}>{formatDateOnly(visitDate, 'EEEE, d MMMM yyyy')}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.totalLabel}>{t('total', 'Total')}</Text>
          <Text style={styles.totalValue}>{formatEtb(total)}</Text>
        </View>
      </Card>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button label={t('back', 'Back')} variant="secondary" onPress={onBack} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={isSubmitting ? t('loading', 'Loading…') : t('confirmAndPay', 'Confirm & Pay')}
            onPress={onConfirm}
            loading={isSubmitting}
            disabled={isSubmitting}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  catName: { fontSize: typography.sizes.sm, color: colors.text, flex: 1 },
  catAmount: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: '600' },
  label: { fontSize: typography.sizes.sm, color: colors.textMuted },
  value: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalLabel: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.brandPrimary },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
