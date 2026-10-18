import { StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RequireRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';
import { colors, spacing, typography } from '@/theme';

export default function BookTab() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <RequireRole role={ROLES.VISITOR}>
      <Screen>
        <Card>
          <Text style={styles.title}>{t('bookTabTitle', 'Book a visit')}</Text>
          <Text style={styles.body}>
            {t('bookTabBody', 'Pick a category and a visit date to get started.')}
          </Text>
          <Button
            label={t('startBooking', 'Start booking')}
            onPress={() => router.push('/(visitor)/book/new' as any)}
          />
        </Card>
      </Screen>
    </RequireRole>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md },
});
