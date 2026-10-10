import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { BookingRow } from "./BookingRow";
import { CorrectionSheet } from "./CorrectionSheet";
import {
  ManagerBookingsFilters,
  useManagerBookings,
} from "@/api/queries/manager-bookings";
import type { BookingResponse } from "@/api/queries/bookings";

type Tab = "flagged" | "all";

const STATUSES: Array<NonNullable<ManagerBookingsFilters["status"]>> = [
  "awaiting_payment",
  "pending",
  "visited",
  "cancelled",
  "refunded",
];

export function BookingsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("flagged");
  const [status, setStatus] =
    useState<ManagerBookingsFilters["status"]>(undefined);
  const [selected, setSelected] = useState<BookingResponse | null>(null);

  const filters: ManagerBookingsFilters = {
    flagged: tab === "flagged" ? true : undefined,
    status,
    limit: 20,
    offset: 0,
  };

  const query = useManagerBookings(filters);
  const bookings = query.data?.data ?? [];

  return (
    <Screen>
      <View style={styles.segment}>
        <Pressable
          onPress={() => setTab("flagged")}
          style={[
            styles.segmentBtn,
            tab === "flagged" && styles.segmentBtnActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              tab === "flagged" && styles.segmentTextActive,
            ]}
          >
            {t("managerBookingsTabFlagged", "Flagged")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("all")}
          style={[styles.segmentBtn, tab === "all" && styles.segmentBtnActive]}
        >
          <Text
            style={[
              styles.segmentText,
              tab === "all" && styles.segmentTextActive,
            ]}
          >
            {t("managerBookingsTabAll", "All")}
          </Text>
        </Pressable>
      </View>

      {tab === "all" ? (
        <View style={styles.chips}>
          <Pressable
            onPress={() => setStatus(undefined)}
            style={[styles.chip, status === undefined && styles.chipActive]}
          >
            <Text style={styles.chipText}>
              {t("managerBookingsStatusAll", "All statuses")}
            </Text>
          </Pressable>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[styles.chip, status === s && styles.chipActive]}
            >
              <Text style={styles.chipText}>{t(s, s)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={styles.error}>
            {t("managerBookingsLoadError", "Could not load bookings")}
          </Text>
          <Pressable onPress={() => query.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>{t("retry", "Retry")}</Text>
          </Pressable>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            {tab === "flagged"
              ? t("managerBookingsEmptyFlagged", "Nothing flagged right now.")
              : t("managerBookingsEmptyAll", "No bookings match this filter.")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <BookingRow booking={item} onPress={setSelected} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
            />
          }
        />
      )}

      <CorrectionSheet
        booking={selected}
        onClose={() => setSelected(null)}
        onSuccess={() => setSelected(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    margin: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: { color: colors.text, fontWeight: "600" },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary50,
    borderColor: colors.brandPrimary,
  },
  chipText: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.xs,
    color: colors.text,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  empty: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: "center",
  },
  error: { color: colors.danger, textAlign: "center" },
  retry: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  retryText: {
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.latin,
  },
});
