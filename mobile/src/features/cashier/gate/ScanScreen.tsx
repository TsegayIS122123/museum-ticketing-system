import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { LookupField } from './LookupField';
import { BookingResult } from './BookingResult';
import { useGateLookup } from './useGateLookup';
import { BOOKING_REFERENCE_REGEX } from '@/constants/config';
import { findByReference } from '@/database/offline-bookings';
import { useEnqueueCheckIn, useProcessSyncQueue } from '@/features/cashier/offline/useOfflineSync';
import { useOffline } from '@/features/shared/useOffline';

type Mode = 'camera' | 'manual';

export function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();

  const { state, lookup, reset } = useGateLookup();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>(params.mode === 'manual' ? 'manual' : 'camera');
  const [scanLock, setScanLock] = useState(false);
  const lastScanRef = useRef<string | null>(null);

  // On mount, request camera permission if mode is camera
  useEffect(() => {
    if (mode === 'camera' && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [mode, permission, requestPermission]);

  const handleScan = useCallback(
    (data: string) => {
      if (scanLock) return;
      const ref = data.trim().toUpperCase();
      if (!BOOKING_REFERENCE_REGEX.test(ref)) return;
      if (lastScanRef.current === ref) return;
      lastScanRef.current = ref;
      setScanLock(true);
      lookup(ref);
      // Unlock after a short delay so the user can scan the next visitor
      setTimeout(() => {
        setScanLock(false);
        lastScanRef.current = null;
      }, 1500);
    },
    [scanLock, lookup]
  );

const enqueueCheckIn = useEnqueueCheckIn();
const { process: processQueue } = useProcessSyncQueue();
const offline = useOffline();

const handleDone = async (attended?: number) => {
  reset();
  if (offline && state.kind === "found" && attended !== undefined) {
    await enqueueCheckIn({
      bookingId: state.booking.id,
      reference: state.booking.reference,
      attendedQuantity: attended,
    });
  } else {
    // Trigger a background sync attempt
    processQueue().catch(() => {});
  }
  router.replace("/(cashier)" as any);
};

  const handleBack = () => {
    reset();
    router.back();
  };

if (state.kind === 'found') {
  return (
    <BookingResult
      booking={state.booking}
      onDone={(attended) => handleDone(attended)}
      onBack={handleBack}
    />
  );
}

  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.title}>
          {mode === 'camera'
            ? t('scanTitle', 'Scan visitor QR code')
            : t('manualTitle', 'Enter reference manually')}
        </Text>

        {mode === 'camera' ? (
          <>
            {!permission ? (
              <Card>
                <Text style={styles.hint}>
                  {t('cameraPermissionChecking', 'Checking camera permission…')}
                </Text>
              </Card>
            ) : !permission.granted ? (
              <Card>
                <Text style={styles.hint}>
                  {t(
                    'cameraPermissionNeeded',
                    'Camera access is needed to scan QR codes. Please grant permission.'
                  )}
                </Text>
                <Button
                  label={t('grantCamera', 'Grant camera permission')}
                  onPress={requestPermission}
                />
              </Card>
            ) : (
              <View style={styles.cameraWrap}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => handleScan(data)}
                />
                <View style={styles.overlay} pointerEvents="none">
                  <View style={styles.frame} />
                </View>
              </View>
            )}

            <Button
              label={t('switchToManual', 'Enter reference manually')}
              variant="secondary"
              onPress={() => setMode('manual')}
            />
          </>
        ) : (
          <>
            <LookupField onSubmit={(ref) => lookup(ref)} loading={state.kind === 'loading'} />
            <Button
              label={t('switchToCamera', 'Use camera instead')}
              variant="secondary"
              onPress={() => setMode('camera')}
            />
          </>
        )}

        {state.kind === 'loading' ? (
          <Text style={styles.hint}>{t('searching', 'Looking up booking…')}</Text>
        ) : null}

        {state.kind === 'not-found' ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>
              {t('referenceNotFound', 'No booking found for {{ref}}.', { ref: state.reference })}
            </Text>
            <Button label={t('tryAgain', 'Try again')} variant="secondary" onPress={reset} />
          </Card>
        ) : null}

        {state.kind === 'error' ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{state.message}</Text>
            <Button label={t('tryAgain', 'Try again')} variant="secondary" onPress={reset} />
          </Card>
        ) : null}

        <Button label={t('back', 'Back')} variant="secondary" onPress={handleBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  cameraWrap: { aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '70%', aspectRatio: 1, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: radius.lg },
  hint: { fontSize: typography.sizes.sm, color: colors.textMuted, textAlign: 'center' },
  errorCard: { backgroundColor: '#FEE2E2', gap: spacing.sm },
  errorText: { color: '#991B1B', fontWeight: '600' },
});
