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
import { Card } from '@/components/ui/Card';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuditLog } from '@/api/queries/admin-audit';
import { formatDateTime } from '@/utils/dates';

export function AuditLogList() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useAuditLog();

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
          <Button label={t('retry', 'Retry')} onPress={refetch} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('auditLog', 'Audit log')}</Text>
        <Text style={styles.subtitle}>
          {t('auditLogSubtitle', 'Append-only trail of platform actions.')}
        </Text>
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
          <Card style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.action}>{item.action}</Text>
              <Text style={styles.time}>{formatDateTime(item.created_at)}</Text>
            </View>
            {item.entity_type ? (
              <Text style={styles.entity}>
                {item.entity_type}
                {item.entity_id ? ` · ${item.entity_id.slice(0, 8)}` : ''}
              </Text>
            ) : null}
            {item.actor_user_id ? (
              <Text style={styles.actor}>
                {t('actor', 'Actor')}: {item.actor_user_id.slice(0, 8)}…
              </Text>
            ) : (
              <Text style={styles.actor}>{t('systemActor', 'System')}</Text>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  header: { padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  list: { padding: spacing.lg, paddingTop: 0 },
  card: { marginBottom: spacing.md, gap: spacing.xs },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  action: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, fontWeight: '700', color: colors.text },
  time: { fontSize: typography.sizes.xs, color: colors.textMuted },
  entity: { fontSize: typography.sizes.xs, color: colors.textMuted },
  actor: { fontSize: typography.sizes.xs, color: colors.textMuted },
  error: { color: colors.danger },
});
