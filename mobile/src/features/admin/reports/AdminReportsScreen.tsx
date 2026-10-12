import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { AttendanceTab } from './AttendanceTab';
import { TimelineTab } from './TimelineTab';
import { CashierBalancesTab } from './CashierBalancesTab';
import { CategoriesTab } from './CategoriesTab';
import { ComparisonTab } from './ComparisonTab';
import { InstitutionsTab } from './InstitutionsTab';
import { RevenueTab } from './RevenueTab';

type Segment = 'attendance' | 'timeline' | 'cashierBalances' | 'categories' | 'comparison' | 'institutions' | 'revenue';

const SEGMENTS: { key: Segment; labelKey: string; fallback: string }[] = [
  { key: 'attendance', labelKey: 'admin_reports_attendance', fallback: 'Attendance' },
  { key: 'timeline', labelKey: 'admin_reports_timeline', fallback: 'Timeline' },
  { key: 'cashierBalances', labelKey: 'admin_reports_cashier_balances', fallback: 'Cashier balances' },
  { key: 'categories', labelKey: 'admin_reports_categories', fallback: 'Categories' },
  { key: 'comparison', labelKey: 'admin_reports_comparison', fallback: 'Comparison' },
  { key: 'institutions', labelKey: 'admin_reports_institutions', fallback: 'Institutions' },
  { key: 'revenue', labelKey: 'admin_reports_revenue', fallback: 'Revenue' },
];

export function AdminReportsScreen() {
  const { t } = useTranslation();
  const [seg, setSeg] = useState<Segment>('attendance');

  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segment}>
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSeg(s.key)}
            style={[styles.segmentBtn, seg === s.key && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, seg === s.key && styles.segmentTextActive]}>
              {t(s.labelKey, s.fallback)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.body}>
        {seg === 'attendance' && <AttendanceTab />}
        {seg === 'timeline' && <TimelineTab />}
        {seg === 'cashierBalances' && <CashierBalancesTab />}
        {seg === 'categories' && <CategoriesTab />}
        {seg === 'comparison' && <ComparisonTab />}
        {seg === 'institutions' && <InstitutionsTab />}
        {seg === 'revenue' && <RevenueTab />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { padding: spacing.md, gap: spacing.sm },
  segmentBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtnActive: { backgroundColor: colors.primary50, borderColor: colors.brandPrimary },
  segmentText: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  body: { flex: 1 },
});
