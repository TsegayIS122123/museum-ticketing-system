import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { isCurrentlyFlagged } from "@/api/queries/manager-bookings";
import type { BookingResponse } from "@/api/queries/bookings";

export type BookingRowProps = {
  booking: BookingResponse;
  onPress: (booking: BookingResponse) => void;
};

export function BookingRow({ booking, onPress }: BookingRowProps) {
  const { t, i18n } = useTranslation();
  const isAm = i18n.language === "am";
  const firstItem = booking.items?.[0];
  const categoryName = isAm
    ? (firstItem?.categoryNameAm ?? "")
    : (firstItem?.categoryNameEn ?? "");
  const flagged = isCurrentlyFlagged(booking);

  return (
    <Pressable onPress={() => onPress(booking)}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.left}>
            <Text style={styles.reference}>{booking.reference}</Text>
            {flagged ? (
              <View
                style={styles.flagDot}
                accessibilityLabel={t(
                  "managerBookingsFlaggedBadge",
                  "Flagged for review",
                )}
              />
            ) : null}
          </View>
          <StatusBadge status={booking.status} />
        </View>

        <Text style={styles.meta}>
          {booking.visitDate} ·{" "}
          {booking.bookingType === "group"
            ? t("managerBookingsGroup", "Group")
            : t("managerBookingsIndividual", "Individual")}
        </Text>

        {categoryName ? (
          <Text style={styles.meta}>
            {categoryName} × {booking.bookedQuantity}
          </Text>
        ) : null}

        {booking.groupName ? (
          <Text style={styles.meta}>{booking.groupName}</Text>
        ) : null}

        <Text style={styles.total}>{booking.totalAmountEtb} ETB</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reference: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.md,
    fontWeight: "700",
    color: colors.text,
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning ?? "#F59E0B",
  },
  meta: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  total: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.md,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.xs,
  },
});
