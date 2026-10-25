import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Camera, Flashlight, UsersThree } from '@unifesto/unicon/react-native';
import { boothScan, getPortalLeads } from '../lib/api/sponsorPortal';
import useTopSpacing from '../hooks/useTopSpacing';
import ScanReticle, { type ReticleState } from '../components/checkin/ScanReticle';
import ScanResultCard, { type ScanFeedback } from '../components/checkin/ScanResultCard';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';
import { GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { Button } from '../components/ui';

// Same rhythm as the door scanner: ignore the same QR for a moment, and keep
// problems on screen longer than successes.
const RESCAN_COOLDOWN = 2500;
const SHOW_MS = { success: 2200, already: 3000, error: 4000 } as const;

// Camera-overlay controls: clear Liquid Glass with a dark tint (white text stays
// legible over any frame); a flat dark wash where Liquid Glass isn't available.
const CAMERA_TINT = 'rgba(0, 0, 0, 0.3)';
const GLASS = LIQUID_GLASS ? 'transparent' : 'rgba(0, 0, 0, 0.5)';
const CameraGlass = () => <GlassFill variant="clear" tint={CAMERA_TINT} />;
const WHITE = '#ffffff';
const WHITE_DIM = 'rgba(255, 255, 255, 0.7)';

const buzz = (kind: ScanFeedback['kind']) => Vibration.vibrate(kind === 'success' ? 40 : [0, 90, 80, 90]);

/**
 * Booth lead capture: a sponsor's staff scan an attendee's ticket QR and the
 * attendee becomes a lead (scanning is the consent). The server is idempotent,
 * so a repeat scan is told apart by the lead id we've already seen.
 */
export default function BoothScanScreen({ sponsorId, eventSponsorId }: { sponsorId: string; eventSponsorId: string }) {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing(spacing[2]);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [processing, setProcessing] = useState(false);
  const [captured, setCaptured] = useState(0);
  const processingRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const known = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the leads we already have here, so re-scanning an old one says so.
  useEffect(() => {
    void getPortalLeads(sponsorId).then((res) => {
      if (res.ok) for (const l of res.data) if (l.eventSponsorId === eventSponsorId) known.current.add(l.id);
    });
  }, [sponsorId, eventSponsorId]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const show = useCallback((f: ScanFeedback) => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback(f);
    buzz(f.kind);
    timer.current = setTimeout(() => setFeedback(null), SHOW_MS[f.kind]);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback(null);
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      if (processingRef.current) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < RESCAN_COOLDOWN) return;
      lastScanRef.current = { code, at: now };

      processingRef.current = true;
      setProcessing(true);
      const res = await boothScan(sponsorId, eventSponsorId, code);
      processingRef.current = false;
      setProcessing(false);

      if (!res.ok) {
        show({ kind: 'error', title: "Couldn't add", detail: res.message });
        return;
      }
      const { lead } = res.data;
      const name = lead.name || lead.email || 'Attendee';
      if (known.current.has(lead.id)) {
        show({ kind: 'already', title: 'Already a lead', name, detail: lead.email ?? undefined });
        return;
      }
      known.current.add(lead.id);
      setCaptured((n) => n + 1);
      show({ kind: 'success', title: 'Lead added', name, detail: lead.email ?? undefined });
    },
    [sponsorId, eventSponsorId, show],
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
        <Text style={[styles.msgBody, { color: c.soft }]}>Unifesto uses the camera only to read attendees' ticket QR codes at your booth.</Text>
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
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void handleScan(data)}
      />
      <View style={styles.scrim} pointerEvents="none" />

      <View style={[styles.top, { top: topSpacing }]}>
        <View style={styles.pill}>
          <CameraGlass />
          <UsersThree size={14} color={WHITE} weight="fill" />
          <Text style={styles.pillText}>
            {captured ? `${captured} new lead${captured === 1 ? '' : 's'} this session` : 'Scan attendee tickets'}
          </Text>
        </View>
      </View>

      <View style={styles.middle} pointerEvents="none">
        <ScanReticle state={reticle} />
        {!feedback ? (
          <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.hint}>
            {processing ? 'Adding…' : 'Point at a ticket QR'}
          </Animated.Text>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[4]) + spacing[2] }]}>
        {feedback ? <ScanResultCard feedback={feedback} onDismiss={dismiss} /> : null}
        <View style={styles.tools}>
          <Pressable
            onPress={() => setTorch((t) => !t)}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel="Flashlight"
            style={({ pressed }) => [styles.tool, { backgroundColor: torch ? WHITE : GLASS, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
          >
            {!torch ? <CameraGlass /> : null}
            <Flashlight size={22} color={torch ? '#000000' : WHITE} weight={torch ? 'fill' : 'regular'} />
          </Pressable>
          <View style={[styles.tool, styles.toolWide]}>
            <CameraGlass />
            <Text style={styles.toolText} numberOfLines={2}>
              Scanning a ticket shares that attendee's contact with you.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  shell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8], gap: spacing[3] },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  top: { position: 'absolute', left: spacing[5], right: spacing[5], zIndex: 2 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    backgroundColor: GLASS,
  },
  pillText: { color: WHITE, fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  middle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing[5] },
  hint: { color: WHITE, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  bottom: { position: 'absolute', left: spacing[4], right: spacing[4], bottom: 0, gap: spacing[3], zIndex: 3 },
  tools: { flexDirection: 'row', gap: spacing[3] },
  tool: { height: 52, width: 52, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  toolWide: { flex: 1, width: undefined, paddingHorizontal: spacing[4], backgroundColor: GLASS },
  toolText: { color: WHITE_DIM, fontSize: typography.fontSize.xs, textAlign: 'center', ...cosmosFont.strong },
  msgTitle: { fontSize: typography.fontSize.lg, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  msgBody: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, ...cosmosFont.body },
});
