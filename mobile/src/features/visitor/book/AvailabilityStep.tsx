import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { useAvailability } from '@/api/queries/bookings';
import { toIsoDate, formatDateOnly } from '@/utils/dates';

interface AvailabilityStepProps {
  visitDate: string; // ISO 'YYYY-MM-DD' or ''
  onVisitDateChange: (iso: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function AvailabilityStep({
  visitDate,
  onVisitDateChange,
  onBack,
  onNext,
}: AvailabilityStepProps) {
  const { t } = useTranslation();
  const today = useMemo(() => startOfDay(new Date()), []);
  const horizonDays = 60;
  const dates = useMemo(
    () => Array.from({ length: horizonDays }, (_, i) => addDays(today, i)),
    [today]
  );

  const fromIso = toIsoDate(today);
  const toIso = toIsoDate(addDays(today, horizonDays - 1));
  const { data: rows, isLoading, isError, refetch } = useAvailability(fromIso, toIso);

  const closed = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => {
      if (!r.is_open_for_booking) set.add(r.date);
    });
    return set;
  }, [rows]);

  const isSunday = (d: Date) => d.getDay() === 0;

  const isOpen = (d: Date) => {
    const iso = toIsoDate(d);
    if (closed.has(iso)) return false;
    if (isSunday(d)) return false;
    return true;
  };

  const selected = visitDate ? new Date(visitDate) : null;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
        <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>{t('chooseDate', 'Choose a visit date')}</Text>
      <Text style={styles.sub}>{t('chooseDateSub', 'The museum is closed on Sundays.')}</Text>

      <View style={styles.grid}>
        {dates.map((d) => {
          const iso = toIsoDate(d);
          const open = isOpen(d);
          const isSelected = selected ? isSameDay(d, selected) : false;
          return (
            <Pressable
              key={iso}
              disabled={!open}
              onPress={() => onVisitDateChange(iso)}
              style={[
                styles.cell,
                !open && styles.cellClosed,
                isSelected && styles.cellSelected,
              ]}
            >
              <Text style={[styles.day, !open && styles.dayClosed]}>
                {format(d, 'd')}
              </Text>
              <Text style={[styles.month, !open && styles.dayClosed]}>
                {format(d, 'MMM')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={styles.chosenBox}>
          <Text style={styles.chosenLabel}>{t('selectedDate', 'Selected date')}</Text>
          <Text style={styles.chosenValue}>{formatDateOnly(toIsoDate(selected), 'EEEE, d MMMM yyyy')}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button label={t('back', 'Back')} variant="secondary" onPress={onBack} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('continue', 'Continue')}
            onPress={onNext}
            disabled={!visitDate}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  heading: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  sub: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: 52,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellClosed: { backgroundColor: colors.surfaceAlt, opacity: 0.5 },
  cellSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimaryLight },
  day: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  dayClosed: { color: colors.textMuted },
  month: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
  chosenBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.brandPrimaryLight,
    borderRadius: radius.md,
  },
  chosenLabel: { fontSize: typography.sizes.xs, color: colors.brandPrimary, textTransform: 'uppercase', fontWeight: '700' },
  chosenValue: { fontSize: typography.sizes.md, color: colors.text, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  errorText: { color: colors.danger, marginBottom: spacing.md },
});
