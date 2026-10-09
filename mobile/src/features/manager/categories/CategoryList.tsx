import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { formatEtb } from '@/utils/money';
import {
  useManagerCategories,
  useCategoryMutations,
  type ManagerCategory,
} from '@/api/queries/manager-categories';
import { isApiError } from '@/api/errors';
import { CategoryForm } from './CategoryForm';

export function CategoryList() {
  const { t, i18n } = useTranslation();
  const isAm = i18n.language === 'am';
  const { data, isLoading, isError, refetch, isRefetching } = useManagerCategories();
  const { retire } = useCategoryMutations();

  const [editing, setEditing] = useState<ManagerCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const handleEdit = (c: ManagerCategory) => {
    setEditing(c);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleRetire = (c: ManagerCategory) => {
    Alert.alert(
      t('retireCategoryTitle', 'Retire this category?'),
      t('retireCategoryBody', 'Existing bookings are unaffected.'),
      [
        { text: t('back', 'Cancel'), style: 'cancel' },
        {
          text: t('retire', 'Retire'),
          style: 'destructive',
          onPress: async () => {
            try {
              await retire.mutateAsync(c.id);
            } catch (err) {
              const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
              Alert.alert(t('retireFailed', 'Retire failed'), msg);
            }
          },
        },
      ]
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

  if (isError || !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.toolbar}>
        <Text style={styles.title}>
          {t("ticketCategories", "Ticket categories")}
        </Text>
        <Button label={`+ ${t("add", "Add")}`} onPress={handleNew} />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleEdit(item)}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catName}>
                    {isAm ? item.name_am : item.name_en}
                  </Text>
                  <Text style={styles.catNameAlt}>
                    {isAm ? item.name_en : item.name_am}
                  </Text>
                  <Text style={styles.price}>{formatEtb(item.price_etb)}</Text>
                </View>
                <View style={styles.statusCol}>
                  {item.active ? (
                    <View style={styles.activeDot} />
                  ) : (
                    <Text style={styles.retiredText}>
                      {t("retired", "Retired")}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  label={t("edit", "Edit")}
                  onPress={() => handleEdit(item)}
                />
                {item.active ? (
                  <Button
                    size="sm"
                    variant="danger"
                    label={t("retire", "Retire")}
                    onPress={() => handleRetire(item)}
                  />
                ) : null}
              </View>
            </Card>
          </Pressable>
        )}
      />

      <CategoryForm
        visible={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={refetch}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  list: { padding: spacing.lg, paddingTop: 0 },
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  catName: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  catNameAlt: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  price: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.brandPrimary, marginTop: spacing.sm },
  statusCol: { alignItems: 'flex-end' },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  retiredText: { fontSize: typography.sizes.xs, color: colors.textMuted, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  error: { color: colors.danger },
});
