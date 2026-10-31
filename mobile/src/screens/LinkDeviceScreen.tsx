import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, Vibration, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Camera } from '@unifesto/unicon/react-native';
import ScanReticle, { type ReticleState } from '../components/checkin/ScanReticle';
import ScanResultCard, { type ScanFeedback } from '../components/checkin/ScanResultCard';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { AppAlert } from '../components/ui/AppAlert';
import { Button } from '../components/ui';
import { approveDeviceLink, previewDeviceLink } from '../lib/api/auth';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, cosmosFor, useCosmos } from '../theme/cosmos';

/** What web's "Sign in with the app" QR holds. Not a link, so only this scanner reads it. */
const PREFIX = 'unifesto-link:';
// The camera stays dark in both themes, so the overlay takes the night tokens.
const NIGHT = cosmosFor('dark');
const WHITE = NIGHT.text;

/**
 * Link a device: scan the QR on unifesto.app/login to sign that computer in
 * as me, after I confirm which browser it is. It then shows in Linked devices.
 */
export default function LinkDeviceScreen() {
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  // Held from a scan until its confirm is answered, so one code asks once.
  const busyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const release = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const showError = useCallback((title: string, detail?: string) => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback({ kind: 'error', title, detail });
    Vibration.vibrate([0, 90, 80, 90]);
    timer.current = setTimeout(() => setFeedback(null), 4000);
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      if (!raw.startsWith(PREFIX)) {
        showError('Not a sign-in code', 'On the computer, open unifesto.app/login and choose Sign in with the app.');
        return;
      }
      const code = raw.slice(PREFIX.length);
      busyRef.current = true;
      setBusy(true);
      let name: string;
      try {
        ({ name } = await previewDeviceLink(code));
      } catch (e: any) {
        showError("Couldn't use that code", e.message);
        // A pause before the same expired code is read again.
        setTimeout(release, 2500);
        return;
      }
      Vibration.vibrate(40);
      AppAlert.alert(
        `Sign in on ${name}?`,
        "Only approve a computer you're using right now. It can use your account until you sign it out in Linked devices.",
        [
          { text: 'Cancel', style: 'cancel', onPress: release },
          {
            text: 'Sign in',
            onPress: async () => {
              try {
                await approveDeviceLink(code);
                router.back();
              } catch (e: any) {
                showError("Couldn't sign that computer in", e.message);
                release();
              }
            },
          },
        ],
        { cancelable: false },
      );
    },
    [release, router, showError],
  );

  if (!permission) {
    return (
      <View style={[styles.root, styles.shell, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <ActivityIndicator color={c.text} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.shell, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <Camera size={48} color={c.text} />
        <Text style={[styles.msgTitle, { color: c.text }]} accessibilityRole="header">Camera needed</Text>
        <Text style={[styles.msgBody, { color: c.soft }]}>
          Unifesto uses the camera only to read the sign-in code on the computer.
        </Text>
        <Button
          label={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
          size="lg"
          onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
          style={{ marginTop: spacing[4], alignSelf: 'center' }}
        />
      </View>
    );
  }

  const reticle: ReticleState = busy ? 'busy' : feedback ? feedback.kind : 'idle';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void handleScan(data)}
      />
      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.middle} pointerEvents="none">
        <ScanReticle state={reticle} />
        {!feedback ? (
          <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.hint}>
            {busy ? 'Checking…' : 'Point at the code on unifesto.app/login'}
          </Animated.Text>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[4]) + spacing[2] }]}>
        {feedback ? <ScanResultCard feedback={feedback} onDismiss={() => setFeedback(null)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NIGHT.bg },
  shell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8], gap: spacing[3] },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  middle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing[5] },
  // A soft shadow keeps the hint readable over a bright camera feed.
  hint: {
    color: WHITE,
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing[6],
    ...cosmosFont.strong,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 6,
  },
  bottom: { position: 'absolute', left: spacing[4], right: spacing[4], bottom: 0, gap: spacing[3], zIndex: 3 },
  msgTitle: { fontSize: typography.fontSize.lg, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  msgBody: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, ...cosmosFont.body },
});
