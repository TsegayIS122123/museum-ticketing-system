import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { useCategories, type Category } from '@/api/queries/catalog';
import { formatEtb, multiplyMoney } from '@/utils/money';

export interface CategoryLine {
  categoryId: string;
  quantity: number;
}

interface CategoryStepProps {
  lines: CategoryLine[];
  onLinesChange: (lines: CategoryLine[]) => void;
  onNext: () => void;
}

export function CategoryStep({ lines, onLinesChange, onNext }: CategoryStepProps) {
  const { t, i18n } = useTranslation();
  const { data: categories, isLoading, isError, refetch } = useCategories();
  const isAm = i18n.language === 'am';

  const byId = useMemo(() => {
    const map = new Map<string, Category>();
    (categories ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const setQty = (catId: string, qty: number) => {
    const next = lines.filter((l) => l.categoryId !== catId);
    if (qty > 0) next.push({ categoryId: catId, quantity: qty });
    onLinesChange(next);
  };

  const getQty = (catId: string) =>
    lines.find((l) => l.categoryId === catId)?.quantity ?? 0;

  const total = useMemo(() => {
    let acc = '0.00';
    for (const l of lines) {
      const c = byId.get(l.categoryId);
      if (c) acc = addInline(acc, multiplyMoney(c.price_etb, l.quantity));
    }
    return acc;
  }, [lines, byId]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (isError || !categories) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
        <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>{t('chooseCategory', 'Choose ticket category')}</Text>

      {categories.map((c) => {
        const qty = getQty(c.id);
        return (
          <Card key={c.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.catName}>
                  {isAm ? c.name_am : c.name_en}
                </Text>
                <Text style={styles.catNameAlt}>
                  {isAm ? c.name_en : c.name_am}
                </Text>
                <Text style={styles.price}>{formatEtb(c.price_etb)}</Text>
              </View>
              <View style={styles.qtyBox}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQty(c.id, Math.max(0, qty - 1))}
                  disabled={qty === 0}
                >
                  <Text style={styles.qtyBtnLabel}>−</Text>
                </Pressable>
                <Text style={styles.qtyNum}>{qty}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQty(c.id, qty + 1)}
                >
                  <Text style={styles.qtyBtnLabel}>+</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        );
      })}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('total', 'Total')}</Text>
        <Text style={styles.totalValue}>{formatEtb(total)}</Text>
      </View>

      <Button
        label={t('continue', 'Continue')}
        onPress={onNext}
        disabled={lines.length === 0}
      />
    </ScrollView>
  );
}

// Local inline decimal-string addition (mirrors utils/money.ts)
function addInline(a: string, b: string): string {
  const toMinor = (s: string) => {
    const [w, f = '00'] = s.split('.');
    return BigInt(w) * 100n + BigInt((f + '00').slice(0, 2));
  };
  const fromMinor = (m: bigint) => {
    const sign = m < 0n ? '-' : '';
    const abs = m < 0n ? -m : m;
    return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  };
  return fromMinor(toMinor(a) + toMinor(b));
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  heading: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  catName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  catNameAlt: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  price: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.brandPrimary, marginTop: spacing.sm },
  qtyBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  qtyBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  qtyBtnLabel: { fontSize: 22, fontWeight: '700', color: colors.brandPrimary },
  qtyNum: { minWidth: 32, textAlign: 'center', fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: { fontSize: typography.sizes.md, color: colors.text },
  totalValue: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.brandPrimary },
  errorText: { color: colors.danger, marginBottom: spacing.md },
});
