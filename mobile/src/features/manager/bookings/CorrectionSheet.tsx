import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useManagerCategories } from "@/api/queries/manager-categories";
import {
  CorrectionOp,
  useBatchCorrections,
} from "@/api/queries/manager-bookings";
import type { BookingResponse } from "@/api/queries/bookings";

export type CorrectionSheetProps = {
  booking: BookingResponse | null;
  onClose: () => void;
  onSuccess: (updated: BookingResponse) => void;
};

type EditState = {
  itemId: string;
  categoryId: string;
  quantity: number;
};

/**
 * Sheet-local edits, keyed by the booking they belong to. There is no draft
 * until the user actually changes something (`draft === null` below), so the
 * seed derived from `booking` stays the single source of truth and opening a
 * different booking can never show a stale edit set.
 */
type SheetDraft = {
  bookingId: string;
  edits: EditState[];
  addOpen: boolean;
  addCategoryId: string | null;
  addQuantity: number;
};

export function CorrectionSheet({
  booking,
  onClose,
  onSuccess,
}: CorrectionSheetProps) {
  const { t, i18n } = useTranslation();
  const isAm = i18n.language === "am";
  const categoriesQ = useManagerCategories();
  const batch = useBatchCorrections();

  // Derived during render rather than pushed into state from an effect: the
  // sheet must never render one frame with empty edits when a booking opens.
  const seed = useMemo<EditState[]>(
    () =>
      booking
        ? booking.items.map((it) => ({
            itemId: it.id,
            categoryId: it.categoryId,
            quantity: it.quantity,
          }))
        : [],
    [booking],
  );

  const [draft, setDraft] = useState<SheetDraft | null>(null);
  const active =
    draft && booking && draft.bookingId === booking.id ? draft : null;

  const edits = active?.edits ?? seed;
  const addOpen = active?.addOpen ?? false;
  const addCategoryId = active?.addCategoryId ?? null;
  const addQuantity = active?.addQuantity ?? 1;

  const update = (patch: Partial<Omit<SheetDraft, "bookingId">>) => {
    if (!booking) return;
    setDraft({
      bookingId: booking.id,
      edits: active?.edits ?? seed,
      addOpen: active?.addOpen ?? false,
      addCategoryId: active?.addCategoryId ?? null,
      addQuantity: active?.addQuantity ?? 1,
      ...patch,
    });
  };

  const existingCategoryIds = useMemo(
    () => new Set(edits.map((e) => e.categoryId)),
    [edits],
  );

  const addableCategories = useMemo(
    () =>
      (categoriesQ.data ?? []).filter(
        (c) => c.active && !existingCategoryIds.has(c.id),
      ),
    [categoriesQ.data, existingCategoryIds],
  );

  if (!booking) return null;

  const buildOps = (): CorrectionOp[] => {
    const ops: CorrectionOp[] = [];
    for (let i = 0; i < booking.items.length; i++) {
      const original = booking.items[i];
      const edit = edits.find((e) => e.itemId === original.id);
      if (!edit) continue;
      if (
        edit.categoryId !== original.categoryId ||
        edit.quantity !== original.quantity
      ) {
        ops.push({
          itemId: edit.itemId,
          categoryId: edit.categoryId,
          quantity: edit.quantity,
        });
      }
    }
    if (addOpen && addCategoryId) {
      ops.push({
        itemId: null,
        categoryId: addCategoryId,
        quantity: addQuantity,
      });
    }
    return ops;
  };

  const submit = async () => {
    const ops = buildOps();
    if (ops.length === 0) return;
    const updated = await batch.mutateAsync({
      bookingId: booking.id,
      input: { ops },
    });
    setDraft(null);
    onSuccess(updated);
  };

  const handleClose = () => {
    setDraft(null);
    onClose();
  };

  const busy = batch.isPending;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t("managerBookingsCorrectionTitle", "Correct booking")}
            </Text>
            <Pressable
              onPress={handleClose}
              disabled={busy}
              accessibilityLabel={t("close", "Close")}
            >
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {booking.reference} · {booking.visitDate}
          </Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
          >
            {booking.items.map((it, idx) => {
              const edit = edits.find((e) => e.itemId === it.id);
              if (!edit) return null;
              const categoryLabel = isAm ? it.categoryNameAm : it.categoryNameEn;
              return (
                <View key={it.id} style={styles.line}>
                  <Text style={styles.lineLabel}>{categoryLabel}</Text>
                  <Text style={styles.lineMeta}>
                    {t("attended", "Attended")}: {it.attendedQuantity ?? "—"} /{" "}
                    {it.quantity}
                  </Text>
                  <View style={styles.qtyRow}>
                    <Pressable
                      onPress={() => {
                        const next = [...edits];
                        next[idx] = {
                          ...edit,
                          quantity: Math.max(1, edit.quantity - 1),
                        };
                        update({ edits: next });
                      }}
                      disabled={busy || edit.quantity <= 1}
                      style={styles.qtyBtn}
                    >
                      <Text style={styles.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{edit.quantity}</Text>
                    <Pressable
                      onPress={() => {
                        const next = [...edits];
                        next[idx] = { ...edit, quantity: edit.quantity + 1 };
                        update({ edits: next });
                      }}
                      disabled={busy}
                      style={styles.qtyBtn}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {addOpen ? (
              <View style={styles.line}>
                <Text style={styles.lineLabel}>
                  {t("managerBookingsAddItem", "Add item")}
                </Text>
                {addableCategories.length === 0 ? (
                  <Text style={styles.lineMeta}>
                    {t(
                      "managerBookingsNoMoreCategories",
                      "No more categories available",
                    )}
                  </Text>
                ) : (
                  <View style={styles.chips}>
                    {addableCategories.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => update({ addCategoryId: c.id })}
                        disabled={busy}
                        style={[
                          styles.chip,
                          addCategoryId === c.id && styles.chipActive,
                        ]}
                      >
                        <Text style={styles.chipText}>
                          {isAm ? c.name_am : c.name_en}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() =>
                      update({ addQuantity: Math.max(1, addQuantity - 1) })
                    }
                    disabled={busy || addQuantity <= 1}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{addQuantity}</Text>
                  <Pressable
                    onPress={() => update({ addQuantity: addQuantity + 1 })}
                    disabled={busy}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => update({ addOpen: true })}
                disabled={busy || addableCategories.length === 0}
                style={styles.addBtn}
              >
                <Text style={styles.addBtnText}>
                  + {t("managerBookingsAddItem", "Add item")}
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {batch.isError ? (
            <Text style={styles.error}>
              {t("managerBookingsSubmitError", "Could not apply correction")}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Button
              label={
                busy
                  ? t("managerBookingsSubmitting", "Submitting…")
                  : t("managerBookingsSubmit", "Apply correction")
              }
              onPress={submit}
              disabled={buildOps().length === 0}
              loading={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.lg,
    fontWeight: "700",
    color: colors.text,
  },
  close: {
    fontSize: 28,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  subtitle: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  body: { marginTop: spacing.md },
  bodyContent: { gap: spacing.md, paddingBottom: spacing.md },
  line: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  lineLabel: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.md,
    fontWeight: "600",
    color: colors.text,
  },
  lineMeta: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 20, color: colors.text },
  qtyValue: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.md,
    fontWeight: "600",
    color: colors.text,
    minWidth: 24,
    textAlign: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    fontSize: typography.sizes.sm,
    color: colors.text,
  },
  addBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  addBtnText: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  error: { color: colors.danger, marginTop: spacing.sm },
  footer: { marginTop: spacing.md },
});
