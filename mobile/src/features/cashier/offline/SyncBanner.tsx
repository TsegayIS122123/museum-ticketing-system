import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '@/theme';
import { useSyncContext } from './SyncProvider';

export function SyncBanner() {
  const { t } = useTranslation();
  const { pendingCount, isProcessing, process } = useSyncContext();

  if (pendingCount === 0 && !isProcessing) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {isProcessing
          ? t('syncing', 'Syncing {{n}} offline check-ins…', { n: pendingCount })
          : t('pendingSync', '{{n}} check-in(s) waiting to sync', { n: pendingCount })}
      </Text>
      {!isProcessing && pendingCount > 0 ? (
        <Text style={styles.action} onPress={process}>
          {t('syncNow', 'Sync now')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: { color: '#FFFFFF', fontSize: typography.sizes.xs, fontWeight: '600', flex: 1 },
  action: { color: '#FFFFFF', fontSize: typography.sizes.xs, fontWeight: '700', textDecorationLine: 'underline' },
});
