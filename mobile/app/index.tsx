import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { colors, spacing } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('appName', 'ZNHM Ticketing')}</Text>
        <LanguageToggle />
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>
          {t('mobilePhase1Title', 'Mobile Foundation Ready')}
        </Text>
        <Text style={styles.cardBody}>
          {t(
            'mobilePhase1Body',
            'Phase 1 complete: theme, i18n, API client, and navigation are set up. Role-based routing arrives in Phase 2.'
          )}
        </Text>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('museumName', 'Zoological Natural History Museum')}
        </Text>
        <Text style={styles.footerSub}>
          {t('museumLocation', 'AAU CNCS, 4 Killo, Addis Ababa')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.brandPrimary,
  },
  card: { marginTop: spacing.md },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cardBody: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  footer: { marginTop: 'auto', paddingTop: spacing.xl, alignItems: 'center' },
  footerText: { fontSize: 13, color: colors.textMuted },
  footerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
