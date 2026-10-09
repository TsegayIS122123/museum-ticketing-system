import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';
import { useOffline } from './useOffline';

export function OfflineBanner() {
  const { t } = useTranslation();
  const offline = useOffline();
  if (!offline) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {t('offlineBanner', 'You are offline — showing cached tickets only.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  text: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
});
