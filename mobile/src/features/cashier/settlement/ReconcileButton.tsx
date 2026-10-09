import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { useReconcile, type Reconciliation } from '@/api/queries/settlement';
import { isApiError } from '@/api/errors';
import { useOffline } from '@/features/shared/useOffline';

interface ReconcileButtonProps {
  onSuccess?: (result: Reconciliation) => void;
  disabled?: boolean;
}

export function ReconcileButton({ onSuccess, disabled }: ReconcileButtonProps) {
  const { t } = useTranslation();
  const reconcile = useReconcile();
  const offline = useOffline();

  const handlePress = () => {
    Alert.alert(
      t('reconcileTitle', 'Initiate settlement transfer?'),
      t(
        'reconcileBody',
        'The full outstanding balance will be transferred to the Finance Office. This action cannot be undone.'
      ),
      [
        { text: t('back', 'Cancel'), style: 'cancel' },
        {
          text: t('confirmTransfer', 'Initiate transfer'),
          onPress: async () => {
            try {
              const result = await reconcile.mutateAsync();
              onSuccess?.(result);
            } catch (err) {
              const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
              Alert.alert(t('reconcileFailed', 'Settlement failed'), msg);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.wrap}>
      {offline ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            {t('reconcileRequiresOnline', 'Settlement requires an internet connection.')}
          </Text>
        </View>
      ) : null}

      <Button
        label={
          reconcile.isPending
            ? t('processing', 'Processing…')
            : t('initiateTransfer', 'Initiate transfer')
        }
        onPress={handlePress}
        disabled={disabled || offline}
        loading={reconcile.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  offline: {
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  offlineText: { color: '#92400E', fontSize: typography.sizes.sm, fontWeight: '600', textAlign: 'center' },
});
