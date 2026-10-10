import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { useAvailabilityRange, useSetAvailability } from '@/api/queries/manager-availability';
import { toIsoDate } from '@/utils/dates';
import { Pressable } from 'react-native';

export function AvailabilityScreen() {
  const { t } = useTranslation();
  const today = useMemo(() => startOfDay(new Date()), []);
  const horizon = 60;
  const dates = useMemo(
    () => Array.from({ length: horizon }, (_, i) => addDays(today, i)),
    [today]
  );
  const fromIso = toIsoDate(today);
  const toIso = toIsoDate(addDays(today, horizon - 1));
  const { data, isLoading, refetch } = useAvailabilityRange(fromIso, toIso);
  const setAvail = useSetAvailability();

  const [selected, setSelected] = useState<string | null>(null);

  const closedSet = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => {
      if (!r.isOpenForBooking) s.add(r.date);
    });
    return s;
  }, [data]);

  const isSunday = (d: Date) => d.getDay() === 0;

  const handleToggle = (open: boolean) => {
    if (!selected) return;
    setAvail.mutate(
      { date: selected, open },
      { onSuccess: () => refetch() }
    );
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('availabilityTitle', 'Date availability')}</Text>
        <Text style={styles.subtitle}>
          {t('availabilitySubtitle', 'Open or close individual dates. Sundays are always closed.')}
        </Text>

        <View style={styles.grid}>
          {dates.map((d) => {
            const iso = toIsoDate(d);
            const isClosed = closedSet.has(iso) || isSunday(d);
            const isSel = selected === iso;
            return (
              <Pressable
                key={iso}
                onPress={() => setSelected(iso)}
                style={[
                  styles.cell,
                  isClosed && styles.cellClosed,
                  isSel && styles.cellSelected,
                ]}
              >
                <Text style={[styles.day, isClosed && styles.dayClosed]}>{format(d, 'd')}</Text>
                <Text style={[styles.month, isClosed && styles.dayClosed]}>
                  {format(d, 'MMM')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <Card style={styles.panel}>
            <Text style={styles.panelTitle}>{selected}</Text>
            <Text style={styles.panelSub}>
              {closedSet.has(selected) ? t('currentlyClosed', 'Currently closed') : t('currentlyOpen', 'Currently open')}
            </Text>
            <View style={styles.panelActions}>
              <Button
                label={t('open', 'Open')}
                onPress={() => handleToggle(true)}
                loading={setAvail.isPending}
              />
              <Button
                label={t('close', 'Close')}
                variant="danger"
                onPress={() => handleToggle(false)}
                loading={setAvail.isPending}
              />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: 52, height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cellClosed: { backgroundColor: colors.surfaceAlt, opacity: 0.5 },
  cellSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimaryLight },
  day: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  dayClosed: { color: colors.textMuted },
  month: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
  panel: { marginTop: spacing.lg, gap: spacing.sm },
  panelTitle: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  panelSub: { fontSize: typography.sizes.sm, color: colors.textMuted },
  panelActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
