import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useAuth } from '@/auth/useAuth';
import { homeForRole } from '@/auth/guards';
import { ROLES } from '@/constants/config';
import { colors, radius, spacing, typography } from '@/theme';
import { BRAND } from '@/constants/brand';
import { ASSETS } from '@/constants/assets';

// The visitor home screen mirrors the web landing page: the same hero image and
// promise, the same three-step explanation, and the same set of entry points.
// The language toggle sits above the hero (not buried at the bottom) so the
// EN/AM switch is visible the moment the screen opens, and the sign-in /
// create-account pair only appears while signed out -- the single front door
// for every role, exactly like the web header.
function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // This screen is public, so it is also the one place a signed-in staff
  // account could land on visitor ground (deep link, stale navigation state).
  // Staff keep their own home, exactly as the old group-wide guard enforced.
  if (user && user.role !== ROLES.VISITOR) {
    return <Redirect href={homeForRole(user.role) as any} />;
  }

  // Signed out, "Book a visit" goes to the single sign-in front door (the web
  // app does the same, via /signin?redirect=/book). Signed in, it opens the
  // booking flow.
  const bookHref = isAuthenticated ? '/(visitor)/book' : '/(auth)/sign-in';

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Top bar: brand + navigation + language toggle */}
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>{t('museumName', BRAND.museumName)}</Text>
            <View style={styles.headerLinks}>
              <Pressable onPress={() => router.push(bookHref as any)}>
                <Text style={styles.headerLink}>{t('bookVisit', 'Book a visit')}</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(visitor)/(tabs)/tickets' as any)}>
                <Text style={styles.headerLink}>{t('manageBookings', 'Manage bookings')}</Text>
              </Pressable>
              {!isAuthenticated ? (
                <>
                  <Pressable onPress={() => router.push('/(auth)/sign-in' as any)}>
                    <Text style={styles.headerLink}>{t('signIn', 'Sign in')}</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/(auth)/register' as any)}>
                    <Text style={styles.headerLink}>{t('sign_up', 'Create account')}</Text>
                  </Pressable>
                </>
              ) : null}
              <LanguageToggle />
            </View>
          </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={ASSETS.images.heroWaliaIbex}
            style={styles.heroImage}
            accessibilityLabel={t('heroImageAlt', 'Walia Ibex at ZNHM')}
          />
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <View style={styles.logoRow}>
              <Image
                source={ASSETS.brand.aauLogo}
                style={styles.logo}
                accessibilityLabel={t('aau_logo_alt', 'Addis Ababa University')}
              />
              <Text style={styles.logoText}>{t('museumName', BRAND.museumName)}</Text>
            </View>
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
                onPress={() => router.push(bookHref as any)}
              />
              {!isAuthenticated && (
                <View style={styles.authActions}>
                  <Button
                    label={t('signIn', 'Sign in')}
                    variant="secondary"
                    onPress={() => router.push('/(auth)/sign-in' as any)}
                  />
                  <Button
                    label={t('sign_up', 'Create account')}
                    variant="secondary"
                    onPress={() => router.push('/(auth)/register' as any)}
                  />
                </View>
              )}
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
          <Pressable onPress={() => router.push(bookHref as any)}>
            <Card padding={false} style={styles.exhibitCard}>
              <Image
                source={ASSETS.images.heroWaliaIbex}
                style={styles.exhibitImage}
                accessibilityLabel={t('heroImageAlt', 'Walia Ibex at ZNHM')}
              />
              <View style={styles.exhibitInfo}>
                <Text style={styles.exhibitName}>{t('galleryWaliaIbexName', 'Walia Ibex')}</Text>
                <Text style={styles.exhibitTag}>{t('galleryWaliaIbexTag', 'Mammal · Endemic to Ethiopia')}</Text>
              </View>
            </Card>
          </Pressable>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('museumName', BRAND.museumName)}</Text>
          <Pressable onPress={() => router.push('/(auth)/sign-in' as any)}>
            <Text style={styles.staffLink}>{t('staffSignIn', 'Staff Sign In')}</Text>
          </Pressable>
        </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default HomeScreen;

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
  content: { width: '100%', maxWidth: 800, alignSelf: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    flexShrink: 1,
    color: colors.brandPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  headerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  headerLink: {
    color: colors.brandPrimary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
  hero: { height: 420, position: 'relative', justifyContent: 'flex-end' },
  heroImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,20,40,0.55)' },
  heroContent: { padding: spacing.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  logo: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surface },
  logoText: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
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
  heroActions: { marginTop: spacing.lg, gap: spacing.sm },
  authActions: { flexDirection: 'row', gap: spacing.sm },
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
  exhibitCard: { overflow: 'hidden' },
  exhibitImage: { width: '100%', height: 180 },
  exhibitInfo: { padding: spacing.md },
  exhibitName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  exhibitTag: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  footer: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  footerText: { color: colors.textMuted, fontSize: typography.sizes.xs },
  staffLink: { color: colors.textMuted, fontSize: typography.sizes.xs, textDecorationLine: 'underline' },
});
