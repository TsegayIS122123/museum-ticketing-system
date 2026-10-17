import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useAuth } from '@/auth/useAuth';
import { SyncBanner } from "@/features/cashier/offline/SyncBanner";

export function CashierHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <Screen>
      {/* The offline queue's only surface. It renders nothing when the queue
          is empty and no sync is running, so this is a no-op on a normal
          day at the gate -- but without it a queued check-in, a 409
          conflict against another cashier, or a failed sync was invisible:
          the count, the "Syncing…" state and the manual "Sync now" retry
          all live in this banner. */}
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Text style={styles.title}>
            {t("cashierHomeTitle", "Cashier console")}
          </Text>
          <Text style={styles.subtitle}>
            {t("cashierWelcome", "Welcome")}, {user?.full_name ?? user?.email}
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button
            label={t("openGateScanner", "Open gate scanner")}
            onPress={() => router.push("/(cashier)/scan" as any)}
          />
          <Button
            label={t("manualLookup", "Enter reference manually")}
            variant="secondary"
            onPress={() => router.push("/(cashier)/scan?mode=manual" as any)}
          />
          <Button
            label={t("openSettlement", "Settlement")}
            variant="secondary"
            onPress={() => router.push("/(cashier)/settlement" as any)}
          />
        </View>

        <Card>
          <Text style={styles.hint}>
            {t(
              "cashierHint",
              "Scan a visitor QR code or type an 8-character reference to record attendance.",
            )}
          </Text>
        </Card>

        <Button
          label={t("signOut", "Sign out")}
          variant="secondary"
          onPress={signOut}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  actions: { gap: spacing.md, marginVertical: spacing.md },
  hint: { fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: 20 },
});
