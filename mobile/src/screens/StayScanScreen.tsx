import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Bed, Camera, Flashlight } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import ScanReticle, { type ReticleState } from '../components/checkin/ScanReticle';
import ScanResultCard, { type ScanFeedback } from '../components/checkin/ScanResultCard';
import { GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { Button } from '../components/ui';
import { lookupStayPass } from '../lib/api/stays';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, cosmosFor, cosmosRadius, useCosmos } from '../theme/cosmos';

const RESCAN_COOLDOWN = 2500;
// The camera stays dark in both themes, so the overlay takes the night tokens.
const NIGHT = cosmosFor('dark');
const CAMERA_TINT = 'rgba(0, 0, 0, 0.3)';
const GLASS = LIQUID_GLASS ? 'transparent' : 'rgba(0, 0, 0, 0.5)';
const CameraGlass = () => <GlassFill variant="clear" tint={CAMERA_TINT} radius={cosmosRadius} />;
const WHITE = NIGHT.text;
const WHITE_DIM = 'rgba(255, 255, 255, 0.7)';
const PASS_RE = /^STAY-[2-9A-HJ-NP-Z]{6}$/;

/**
 * The property desk: scan a guest's Stay Pass and jump straight to their
 * booking, where the team takes payment, checks them in and sees the room.
 */
export default function StayScanScreen() {
  // `desk=1`: opened by Crew, who work the property desk but don't manage bookings.
  const { eventId, desk } = useLocalSearchParams<{ eventId: string; desk?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing(spacing[2]);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [processing, setProcessing] = useState(false);
  const [active, setActive] = useState(true);
  const processingRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pause the camera while a booking is open on top, resume on return.
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const showError = useCallback((title: string, detail?: string) => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback({ kind: 'error', title, detail });
    Vibration.vibrate([0, 90, 80, 90]);
    timer.current = setTimeout(() => setFeedback(null), 4000);
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      if (processingRef.current || !eventId) return;
      const code = raw.trim().toUpperCase();
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < RESCAN_COOLDOWN) return;
      lastScanRef.current = { code, at: now };

      if (!PASS_RE.test(code)) {
        showError('Not a Stay Pass', 'Event tickets are scanned from Scan tickets.');
        return;
      }
      processingRef.current = true;
      setProcessing(true);
      const res = await lookupStayPass(eventId, code);
      processingRef.current = false;
      setProcessing(false);
      if (!res.ok) {
        showError("Couldn't find that pass", res.message);
        return;
      }
      Vibration.vibrate(40);
      setFeedback(null);
      router.push({
        pathname: `/manage/event/${eventId}/stay-booking/${res.data.id}`,
        params: desk === '1' ? { desk: '1' } : {},
      });
    },
    [eventId, desk, router, showError],
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
        <Text style={[styles.msgBody, { color: c.soft }]}>Unifesto uses the camera only to read guests' Stay Pass QR codes.</Text>
        <Button
          label={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
          size="lg"
          onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
          style={{ marginTop: spacing[4], alignSelf: 'center' }}
        />
      </View>
    );
  }

  const reticle: ReticleState = processing ? 'busy' : feedback ? feedback.kind : 'idle';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {active ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void handleScan(data)}
        />
      ) : null}
      <View style={styles.scrim} pointerEvents="none" />

      <View style={[styles.top, { top: topSpacing }]}>
        <View style={styles.label}>
          <Bed size={15} color={WHITE} weight="fill" />
          <Text style={styles.labelText}>Scan a Stay Pass</Text>
        </View>
      </View>

      <View style={styles.middle} pointerEvents="none">
        <ScanReticle state={reticle} />
        {!feedback ? (
          <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.hint}>
            {processing ? 'Looking up…' : 'Point at the guest’s Stay Pass'}
          </Animated.Text>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[4]) + spacing[2] }]}>
        {feedback ? <ScanResultCard feedback={feedback} onDismiss={() => setFeedback(null)} /> : null}
        <View style={styles.tools}>
          <Pressable
            onPress={() => setTorch((t) => !t)}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel="Flashlight"
            style={({ pressed }) => [styles.tool, { backgroundColor: torch ? WHITE : GLASS, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
          >
            {!torch ? <CameraGlass /> : null}
            <Flashlight size={22} color={torch ? NIGHT.primaryFg : WHITE} weight={torch ? 'fill' : 'regular'} />
          </Pressable>
          <View style={[styles.tool, styles.toolWide]}>
            <CameraGlass />
            <Text style={styles.toolText} numberOfLines={2}>
              {desk === '1'
                ? 'Scan the QR on the guest’s Stay Pass to check them in.'
                : 'No camera? Search the pass code in Requests and guests.'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NIGHT.bg },
  shell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8], gap: spacing[3] },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  top: { position: 'absolute', left: spacing[5], right: spacing[5], zIndex: 2 },
  // A label, not a pill: a glyph and plain text over the scrim.
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelText: { flexShrink: 1, color: WHITE, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  middle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing[5] },
  hint: { color: WHITE, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  bottom: { position: 'absolute', left: spacing[4], right: spacing[4], bottom: 0, gap: spacing[3], zIndex: 3 },
  tools: { flexDirection: 'row', gap: spacing[3] },
  tool: { height: 52, width: 52, borderRadius: cosmosRadius, alignItems: 'center', justifyContent: 'center' },
  toolWide: { flex: 1, width: undefined, paddingHorizontal: spacing[4], backgroundColor: GLASS },
  toolText: { color: WHITE_DIM, fontSize: typography.fontSize.xs, textAlign: 'center', ...cosmosFont.body },
  msgTitle: { fontSize: typography.fontSize.xl, lineHeight: 28, textAlign: 'center', ...cosmosFont.display },
  msgBody: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, ...cosmosFont.body },
});
