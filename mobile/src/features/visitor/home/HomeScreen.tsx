import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { colors, radius, spacing, typography } from '@/theme';
import { BRAND } from '@/constants/brand';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1200&h=900&fit=crop&auto=format';

export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.eyebrow}>{t('heroEyebrow', BRAND.tagline)}</Text>
            <Text style={styles.title}>{t('heroTitle', BRAND.museumName)}</Text>
            <Text style={styles.subtitle}>
              {t(
                'heroSubtitle',
                "See Ethiopia's indigenous wildlife preserved exactly as it lived, in a research collection built by AAU zoologists."
              )}
            </Text>
            <Text style={styles.affiliation}>
              {t('heroAffiliation', BRAND.affiliation)}
            </Text>
            <View style={styles.heroActions}>
              <Button
                label={t('heroCta', 'Book a Visit Now')}
                onPress={() => router.push('/(visitor)/book' as any)}
              />
            </View>
          </View>
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <SectionTitle
            title={t('howItWorksTitle', 'How it works')}
            subtitle={t('howItWorksSubtitle', 'Three quick steps from your sofa to the gallery floor.')}
          />
          <Step
            n={1}
            title={t('step1Title', 'Choose your day')}
            body={t('step1Body', 'Pick an open date on the calendar. The museum is closed on Sundays.')}
          />
          <Step
            n={2}
            title={t('step2Title', 'Pay securely online')}
            body={t('step2Body', 'Pay through Chapa and your booking is confirmed straight away.')}
          />
          <Step
            n={3}
            title={t('step3Title', 'Show your QR ticket')}
            body={t('step3Body', 'Show your digital ticket at the gate and walk right in.')}
          />
        </View>

        {/* Featured exhibit */}
        <View style={styles.section}>
          <SectionTitle title={t('galleryTitle', 'From the Collection')} />
          <Pressable
            style={styles.exhibitCard}
            onPress={() => router.push('/(visitor)/book' as any)}
          >
            <Image source={{ uri: HERO_IMAGE }} style={styles.exhibitImage} />
            <View style={styles.exhibitInfo}>
              <Text style={styles.exhibitName}>Walia Ibex</Text>
              <Text style={styles.exhibitTag}>Mammal · Endemic to Ethiopia</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepChip}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl },
  hero: { height: 420, position: 'relative', justifyContent: 'flex-end' },
  heroImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,20,40,0.55)' },
  heroContent: { padding: spacing.xl },
  eyebrow: {
    color: colors.primary300,
    fontSize: typography.sizes.xs,
    letterSpacing: 2,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textInverse,
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    lineHeight: 22,
    opacity: 0.9,
  },
  affiliation: {
    color: colors.primary200,
    fontSize: typography.sizes.xs,
    marginTop: spacing.sm,
  },
  heroActions: { marginTop: spacing.lg },
  section: { padding: spacing.lg },
  stepRow: { flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.md },
  stepChip: {
    width: 32, height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { color: colors.brandPrimary, fontWeight: '700' },
  stepTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  stepBody: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: 2, lineHeight: 20 },
  exhibitCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  exhibitImage: { width: '100%', height: 180 },
  exhibitInfo: { padding: spacing.md },
  exhibitName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  exhibitTag: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
});
