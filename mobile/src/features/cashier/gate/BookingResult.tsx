import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, spacing, typography } from '@/theme';
import { CheckInForm } from './CheckInForm';
import { formatDateOnly } from '@/utils/dates';
import type { GateBooking } from '@/api/queries/gate';

interface BookingResultProps {
  booking: GateBooking;
  onDone: (attended: number) => void;
  onBack: () => void;
  onRecordVoucher: () => void; // ← add this
}

export function BookingResult({
  booking,
  onDone,
  onBack,
  onRecordVoucher,
}: BookingResultProps) {
  const { t, i18n } = useTranslation();
  const isAm = i18n.language === "am";

  const alreadyCheckedIn =
    booking.status === "visited" || booking.checked_in_at != null;

  const notCheckable =
    booking.status === "awaiting_payment" ||
    booking.status === "cancelled" ||
    booking.status === "refunded";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Text style={styles.ref}>{booking.reference}</Text>
          <StatusBadge status={booking.status} />
        </View>

        <Card>
          <Row
            label={t("visitDate", "Visit date")}
            value={formatDateOnly(booking.visit_date, "EEEE, d MMM yyyy")}
          />
          {booking.group_name ? (
            <Row label={t("groupName", "Group")} value={booking.group_name} />
          ) : null}
          {booking.items?.length
            ? booking.items.map((it, i) => (
                <Row
                  key={i}
                  label={
                    isAm ? (it.categoryNameAm ?? "") : (it.categoryNameEn ?? "")
                  }
                  value={String(it.quantity ?? 1)}
                />
              ))
            : null}
        </Card>

        {alreadyCheckedIn ? (
          <Card style={styles.okCard}>
            <Text style={styles.okText}>
              {t("alreadyCheckedIn", "This booking is already checked in.")}
            </Text>
            <Button
              label={t("recordIfmisVoucher", "Record IFMIS voucher")}
              onPress={() => onRecordVoucher()}
            />
          </Card>
        ) : notCheckable ? (
          <Card style={styles.warnCard}>
            <Text style={styles.warnText}>
              {booking.status === "awaiting_payment"
                ? t("notPaid", "This booking has not been paid for.")
                : booking.status === "cancelled"
                  ? t("cancelledRefused", "This booking has been cancelled.")
                  : t("refundedRefused", "This booking has been refunded.")}
            </Text>
          </Card>
        ) : (
          <CheckInForm booking={booking} onSuccess={onDone} />
        )}

        <Button
          label={t("back", "Back")}
          variant="secondary"
          onPress={onBack}
        />
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ref: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, letterSpacing: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLabel: { fontSize: typography.sizes.sm, color: colors.textMuted, flex: 1 },
  rowValue: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: '600' },
  okCard: { backgroundColor: '#D1FAE5' },
  okText: { color: '#065F46', fontWeight: '600' },
  warnCard: { backgroundColor: '#FEE2E2' },
  warnText: { color: '#991B1B', fontWeight: '600' },
});
