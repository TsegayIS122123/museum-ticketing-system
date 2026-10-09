import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useStaffList, type StaffAccount } from '@/api/queries/admin-staff';
import { StaffCard } from './StaffCard';
import { StaffForm } from './StaffForm';
import { useAuth } from '@/auth/useAuth';

export function StaffList() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useStaffList();

  const [editing, setEditing] = useState<StaffAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const handleNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (s: StaffAccount) => {
    setEditing(s);
    setFormOpen(true);
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
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('staffAccounts', 'Staff accounts')}</Text>
          <Text style={styles.subtitle}>
            {user?.email} · {t('rolePlatformAdmin', 'Platform Admin')}
          </Text>
        </View>
        <Button label={`+ ${t('add', 'Add')}`} onPress={handleNew} />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[colors.brandPrimary]}
            tintColor={colors.brandPrimary}
          />
        }
        renderItem={({ item }) => (
          <StaffCard staff={item} onEdit={() => handleEdit(item)} />
        )}
      />

      <View style={styles.footer}>
        <Button label={t('signOut', 'Sign out')} variant="secondary" onPress={signOut} />
      </View>

      <StaffForm
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  list: { padding: spacing.lg, paddingTop: 0 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  error: { color: colors.danger },
});
