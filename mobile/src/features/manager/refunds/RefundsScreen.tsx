import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useRefunds } from '@/api/queries/manager-refunds';
import { RefundRow } from './RefundRow';

/**
 * Manager refunds oversight (read-only): every refund the museum has
 * issued or requested, newest first, from `GET /refunds/` -- the same
 * endpoint the web staff page reads. Deliberately plain: no filters, no
 * actions. A Platform Admin sees the same list (the endpoint is
 * `IsAuthenticated`, staff see all, Visitors only their own).
 */
export function RefundsScreen() {
  const { t } = useTranslation();
  const query = useRefunds();

  const refunds = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data]
  );
  const total = query.data?.pages[0]?.meta.total ?? 0;

  if (query.isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>
            {t('managerRefundsLoadError', 'Could not load refunds')}
          </Text>
          <Button label={t('retry', 'Retry')} onPress={() => query.refetch()} />
        </View>
      </Screen>
    );
  }

  // Declared before the tree on purpose: react-query's v5 result is a
  // discriminated union, so `query.fetchNextPage` is typed `never` inside a
  // closure created under an `isFetchNextPageError` check (that branch only
  // exists on the error variant). Out here the value is the full union.
  const loadMore = () => query.fetchNextPage();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('refunds', 'Refunds')}</Text>
        <Text style={styles.subtitle}>
          {t('refunds_description', 'View and manage visitor refund requests')}
        </Text>
        <Text style={styles.count}>
          {t('managerRefundsCount', '{{n}} refund(s)', { n: total })}
        </Text>
      </View>

      <FlatList
        data={refunds}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <RefundRow refund={item} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) loadMore();
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => query.refetch()}
            colors={[colors.brandPrimary]}
            tintColor={colors.brandPrimary}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{t('managerRefundsEmpty', 'No refunds yet.')}</Text>
          </View>
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors.brandPrimary}
              style={styles.footerSpinner}
            />
          ) : query.isFetchNextPageError ? (
            <Pressable onPress={loadMore} style={styles.footerRetry}>
              <Text style={styles.footerRetryText}>{t('retry', 'Retry')}</Text>
            </Pressable>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.xs, color: colors.textMuted },
  count: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  empty: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  error: { color: colors.danger, textAlign: 'center' },
  footerSpinner: { paddingVertical: spacing.md },
  footerRetry: {
    alignSelf: 'center',
    marginVertical: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  footerRetryText: {
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.latin,
  },
});
