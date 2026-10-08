import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Camera, CaretRight, Flashlight, MagnifyingGlass, MapPin } from '@unifesto/unicon/react-native';
import {
  CheckinNetworkError,
  getCheckinStats,
  isGroupScan,
  scanQRCode,
  submitGroupCheckin,
  type CheckinStats,
  type GroupScanResult,
  type ScanResult,
} from '../lib/api/checkin';
import { useCheckinEvent } from '../hooks/useCheckinEvent';
import { useOfflineCheckin } from '../hooks/useOfflineCheckin';
import { isOnline, useIsOffline } from '../lib/offline/connectivity';
import { enqueueCheckin, findEntry, judgeOfflineScan, offlineStats, recordLiveCheckin } from '../lib/offline/checkinQueue';
import useTopSpacing from '../hooks/useTopSpacing';
import PointChips from '../components/checkin/PointChips';
import ScanReticle, { type ReticleState } from '../components/checkin/ScanReticle';
import ScanResultCard, { type ScanFeedback } from '../components/checkin/ScanResultCard';
import GroupCheckinSheet from '../components/checkin/GroupCheckinSheet';
import { attendeeName } from '../utils/checkinFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';

// Ignore repeat reads of the same code within this window (ms): the camera
// fires many times per second while a QR stays in frame.
const RESCAN_COOLDOWN = 2500;
// How long each verdict stays up. Problems stay longer: staff need to act.
const SHOW_MS = { success: 2200, already: 3500, error: 4000 } as const;

// The camera overlay is dark in both themes, so this screen uses fixed colours.
// Camera-overlay controls: clear Liquid Glass with a dark tint (white text stays
// legible over any frame); a flat dark wash where Liquid Glass isn't available.
const CAMERA_TINT = 'rgba(0, 0, 0, 0.3)';
const GLASS = LIQUID_GLASS ? 'transparent' : 'rgba(0, 0, 0, 0.5)';
const CameraGlass = () => <GlassFill variant="clear" tint={CAMERA_TINT} />;
const WHITE = '#ffffff';
const WHITE_DIM = 'rgba(255, 255, 255, 0.7)';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

const buzz = (kind: ScanFeedback['kind']) =>
  Vibration.vibrate(kind === 'success' ? 40 : [0, 90, 80, 90]);

export default function CheckinScannerScreen({ eventId, checkinTypeId }: { eventId: string; checkinTypeId?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing(spacing[2]);
  const [permission, requestPermission] = useCameraPermissions();
  const { points, loading: pointsLoading } = useCheckinEvent(eventId);
  const offline = useOfflineCheckin(eventId);
  const isOffline = useIsOffline();

  const [pointId, setPointId] = useState(checkinTypeId ?? '');
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [torch, setTorch] = useState(false);

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false); // state lags the camera's scan callbacks
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [group, setGroup] = useState<GroupScanResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // The open group sheet came from the saved list, so its submit is queued.
  const [groupOffline, setGroupOffline] = useState(false);

  // One point: no need to ask.
  useEffect(() => {
    if (!pointId && points.length === 1) setPointId(points[0].id);
  }, [points, pointId]);

  const loadStats = useCallback(async () => {
    if (!pointId) return;
    try {
      setStats(await getCheckinStats(eventId, pointId));
    } catch {
      // Non-fatal: the counter just stays as it was.
    }
  }, [eventId, pointId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  /** Show a verdict and (re)start its own dismiss timer, cancelling the last one. */
  const show = useCallback((f: ScanFeedback) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(f);
    buzz(f.kind);
    feedbackTimer.current = setTimeout(() => setFeedback(null), SHOW_MS[f.kind]);
  }, []);

  const dismiss = useCallback(() => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(null);
  }, []);

  const showResult = useCallback(
    (r: ScanResult) => {
      const name = attendeeName(r.attendee);
      if (r.alreadyCheckedIn) {
        const at = r.checkedInAt
          ? new Date(r.checkedInAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
          : null;
        show({ kind: 'already', title: 'Already checked in', name, detail: at ? `First scanned at ${at}` : r.ticketType });
      } else {
        show({ kind: 'success', title: 'Checked in', name, detail: r.ticketType });
      }
    },
    [show],
  );

  /** Judge a scan against the saved guest list and queue the check-in. */
  const scanOffline = useCallback(
    async (code: string) => {
      const store = offline.store;
      const verdict = store
        ? judgeOfflineScan(store, code, pointId)
        : ({ kind: 'no-roster' } as const);
      switch (verdict.kind) {
        case 'no-roster':
          show({
            kind: 'error',
            title: "You're offline",
            detail: 'No saved guest list for this event yet. Connect once to download it.',
          });
          return;
        case 'unknown':
          show({
            kind: 'error',
            title: 'Not on the saved list',
            detail: offline.rosterSavedAt
              ? `List saved at ${clock(offline.rosterSavedAt)}. Anyone who registered after that needs a live scan.`
              : 'This QR is not on the saved guest list.',
          });
          return;
        case 'blocked':
          show({ kind: 'error', title: "Couldn't check in", name: verdict.entry.name ?? undefined, detail: verdict.reason });
          return;
        case 'already':
          show({
            kind: 'already',
            title: 'Already checked in',
            name: verdict.entry.name ?? 'Attendee',
            detail: `First scanned at ${clock(verdict.at)}`,
          });
          return;
        case 'group':
          Vibration.vibrate(40);
          dismiss();
          setGroupOffline(true);
          setGroup(verdict.view);
          setSelected(new Set(verdict.view.members.filter((m) => !m.checkedInAtPoint).map((m) => m.index)));
          return;
        case 'admitted':
          await enqueueCheckin(store!, verdict.entry, pointId);
          show({
            kind: 'success',
            title: 'Checked in',
            name: verdict.entry.name ?? 'Attendee',
            detail: `${verdict.entry.ticketType} · syncs when back online`,
          });
      }
    },
    [offline.store, offline.rosterSavedAt, pointId, show, dismiss],
  );

  const handleScan = useCallback(
    async (code: string) => {
      if (!pointId || processingRef.current || group) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < RESCAN_COOLDOWN) return;
      lastScanRef.current = { code, at: now };

      processingRef.current = true;
      setProcessing(true);
      try {
        // Known offline: don't wait on a request that will time out.
        if (!isOnline()) {
          await scanOffline(code);
          return;
        }
        const result = await scanQRCode(code, pointId);
        if (isGroupScan(result)) {
          // Group ticket: nobody is checked in yet — pick who's here.
          Vibration.vibrate(40);
          dismiss();
          setGroupOffline(false);
          setGroup(result);
          setSelected(new Set(result.members.filter((m) => !m.checkedInAtPoint).map((m) => m.index)));
          return;
        }
        showResult(result);
        // Keep the saved list current so a later offline rescan reads "already in".
        if (offline.store) recordLiveCheckin(offline.store, { code }, pointId, result.checkedInAt);
        if (!result.alreadyCheckedIn) void loadStats();
      } catch (e) {
        // The connection dropped mid-scan: the saved list takes over.
        if (e instanceof CheckinNetworkError) await scanOffline(code);
        else show({ kind: 'error', title: "Couldn't check in", detail: e instanceof Error ? e.message : 'Please try again.' });
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [pointId, group, dismiss, showResult, show, loadStats, scanOffline, offline.store],
  );

  const closeGroup = useCallback(() => {
    setGroup(null);
    setGroupOffline(false);
    setSelected(new Set());
    lastScanRef.current = null; // allow an immediate re-scan of the same QR
  }, []);

  const toggleMember = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!group) return;
    setSelected((prev) => (prev.size === group.members.length ? new Set() : new Set(group.members.map((m) => m.index))));
  }, [group]);

  const submitGroup = useCallback(async () => {
    if (!group || !pointId || submitting || selected.size === 0) return;
    setSubmitting(true);

    const queueGroup = async () => {
      const entry = offline.store ? findEntry(offline.store, group.registrationId) : undefined;
      if (!entry) {
        show({ kind: 'error', title: "You're offline", detail: 'This group is not on the saved guest list.' });
        return;
      }
      await enqueueCheckin(offline.store!, entry, pointId, Array.from(selected));
      const inNow = group.members.filter((m) => m.checkedInAtPoint || selected.has(m.index)).length;
      show({
        kind: 'success',
        title: `${inNow} of ${group.members.length} in`,
        name: group.leadName ? `${group.leadName}'s group` : 'Group checked in',
        detail: `${group.ticketType} · syncs when back online`,
      });
      closeGroup();
    };

    try {
      if (groupOffline || !isOnline()) {
        await queueGroup();
        return;
      }
      const res = await submitGroupCheckin(group.registrationId, pointId, Array.from(selected));
      if (offline.store) {
        recordLiveCheckin(offline.store, { registrationId: group.registrationId }, pointId, null, Array.from(selected));
      }
      show({
        kind: 'success',
        title: `${res.checkedInCount} of ${res.total} in`,
        name: group.leadName ? `${group.leadName}'s group` : 'Group checked in',
        detail: group.ticketType,
      });
      void loadStats();
      closeGroup();
    } catch (e) {
      if (e instanceof CheckinNetworkError) await queueGroup();
      else show({ kind: 'error', title: 'Group check-in failed', detail: e instanceof Error ? e.message : undefined });
    } finally {
      setSubmitting(false);
    }
  }, [group, groupOffline, offline.store, pointId, submitting, selected, show, loadStats, closeGroup]);

  // --- Gates: loading → no access → choose a point → camera permission ---

  if (!permission || pointsLoading) {
    return (
      <Shell>
        <ActivityIndicator color={WHITE} />
      </Shell>
    );
  }

  if (points.length === 0) {
    return (
      <Shell>
        <Message
          title="No check-in access"
          body="You can't check people in at any point for this event yet. Ask a curator to give you access."
        />
      </Shell>
    );
  }

  if (!pointId) {
    return (
      <Shell align="top" paddingTop={topSpacing + spacing[6]}>
        <Text style={styles.chooseTitle}>Where are you scanning?</Text>
        <Text style={styles.chooseBody}>Check-ins are recorded against this point.</Text>
        <View style={styles.chooseList}>
          {points.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPointId(p.id)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chooseRow, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <MapPin size={22} color={WHITE} weight="fill" />
              <Text style={styles.chooseName} numberOfLines={1}>
                {p.name}
              </Text>
              <CaretRight size={16} color={WHITE_DIM} />
            </Pressable>
          ))}
        </View>
      </Shell>
    );
  }

  if (!permission.granted) {
    return (
      <Shell>
        <Camera size={48} color={WHITE} />
        <Message
          title="Camera needed"
          body="Unifesto uses the camera only to read ticket QR codes at the door."
          action={
            permission.canAskAgain
              ? { label: 'Allow camera', onPress: () => void requestPermission() }
              : { label: 'Open settings', onPress: () => void Linking.openSettings() }
          }
        />
      </Shell>
    );
  }

  // Offline, the count comes from the saved list plus queued scans.
  const shownStats = isOffline && offline.store ? offlineStats(offline.store, pointId) ?? stats : stats;
  const syncLine = isOffline
    ? offline.pending > 0
      ? `Offline · ${offline.pending} waiting to sync`
      : offline.rosterSavedAt
        ? `Offline · using list saved at ${clock(offline.rosterSavedAt)}`
        : 'Offline · no saved guest list'
    : offline.pending > 0
      ? `Syncing ${offline.pending} offline check-in${offline.pending === 1 ? '' : 's'}…`
      : null;

  const reticle: ReticleState = processing ? 'busy' : feedback ? feedback.kind : 'idle';
  const activePoint = points.find((p) => p.id === pointId);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        // Undefined pauses scanning while the group sheet is open.
        onBarcodeScanned={group ? undefined : ({ data }) => void handleScan(data)}
      />
      <View style={styles.scrim} pointerEvents="none" />

      {/* Top: point + live count */}
      <View style={[styles.top, { top: topSpacing }]}>
        {points.length > 1 ? (
          <PointChips points={points} value={pointId} onChange={setPointId} onCamera inset={spacing[5]} />
        ) : (
          <View style={[styles.pill, { alignSelf: 'flex-start', marginLeft: spacing[5] }]}>
            <CameraGlass />
            <MapPin size={14} color={WHITE} weight="fill" />
            <Text style={styles.pillText}>{activePoint?.name}</Text>
          </View>
        )}
        {shownStats ? (
          <Text style={styles.count}>
            <Text style={styles.countStrong}>{shownStats.checkedIn.toLocaleString('en-IN')}</Text>
            {` of ${shownStats.total.toLocaleString('en-IN')} in · ${shownStats.remaining.toLocaleString('en-IN')} to go`}
          </Text>
        ) : null}
        {syncLine ? <Text style={styles.syncLine}>{syncLine}</Text> : null}
      </View>

      {/* Middle: reticle */}
      <View style={styles.middle} pointerEvents="none">
        <ScanReticle state={reticle} />
        {!feedback ? (
          <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.hint}>
            {processing ? 'Checking…' : 'Point at a ticket QR'}
          </Animated.Text>
        ) : null}
      </View>

      {/* Bottom: verdict + tools */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[4]) + spacing[2] }]}>
        {feedback ? <ScanResultCard feedback={feedback} onDismiss={dismiss} /> : null}
        <View style={styles.tools}>
          <Pressable
            onPress={() => setTorch((t) => !t)}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel="Flashlight"
            style={({ pressed }) => [
              styles.tool,
              { backgroundColor: torch ? WHITE : GLASS, transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}
          >
            {!torch ? <CameraGlass /> : null}
            <Flashlight size={22} color={torch ? '#000000' : WHITE} weight={torch ? 'fill' : 'regular'} />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: `/checkin/${eventId}/manual`, params: { checkinTypeId: pointId } })
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.tool, styles.toolWide, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <CameraGlass />
            <MagnifyingGlass size={20} color={WHITE} weight="bold" />
            <Text style={styles.toolText}>Search by name</Text>
          </Pressable>
        </View>
      </View>

      <GroupCheckinSheet
        group={group}
        selected={selected}
        onToggle={toggleMember}
        onToggleAll={toggleAll}
        onSubmit={() => void submitGroup()}
        onClose={closeGroup}
        submitting={submitting}
      />
    </View>
  );
}

/** Black full-screen frame for the gate states (the scanner is dark in any theme). */
function Shell({
  children,
  align = 'center',
  paddingTop,
}: {
  children: React.ReactNode;
  align?: 'center' | 'top';
  paddingTop?: number;
}) {
  return (
    <View style={[styles.root, styles.shell, align === 'top' && { justifyContent: 'flex-start', paddingTop }]}>
      <StatusBar style="light" />
      {children}
    </View>
  );
}

function Message({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing[2] }}>
      <Text style={styles.msgTitle}>{title}</Text>
      <Text style={styles.msgBody}>{body}</Text>
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => [styles.msgBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Text style={styles.msgBtnText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  shell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8], gap: spacing[4] },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.25)' },

  top: { position: 'absolute', left: 0, right: 0, gap: spacing[3], zIndex: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    backgroundColor: GLASS,
  },
  pillText: { color: WHITE, fontSize: typography.fontSize.sm, ...font('semibold') },
  count: { color: WHITE_DIM, fontSize: typography.fontSize.sm, marginHorizontal: spacing[5], ...font('medium') },
  countStrong: { color: WHITE, ...font('semibold') },
  syncLine: { color: '#f59e0b', fontSize: typography.fontSize.sm, marginHorizontal: spacing[5], marginTop: -spacing[2], ...font('medium') },

  middle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing[5] },
  hint: { color: WHITE, fontSize: typography.fontSize.base, ...font('medium') },

  bottom: { position: 'absolute', left: spacing[4], right: spacing[4], bottom: 0, gap: spacing[3], zIndex: 3 },
  tools: { flexDirection: 'row', gap: spacing[3] },
  tool: {
    height: 52,
    width: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolWide: { flex: 1, width: undefined, flexDirection: 'row', gap: spacing[2], backgroundColor: GLASS },
  toolText: { color: WHITE, fontSize: typography.fontSize.base, ...font('semibold') },

  chooseTitle: { color: WHITE, fontSize: typography.fontSize['2xl'], textAlign: 'center', ...font('heading') },
  chooseBody: { color: WHITE_DIM, fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  chooseList: { alignSelf: 'stretch', gap: spacing[3], marginTop: spacing[4] },
  chooseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: 60,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.xl,
    backgroundColor: '#141414',
  },
  chooseName: { flex: 1, color: WHITE, fontSize: typography.fontSize.lg, ...font('semibold') },

  msgTitle: { color: WHITE, fontSize: typography.fontSize.xl, textAlign: 'center', ...font('heading') },
  msgBody: { color: WHITE_DIM, fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, ...font() },
  msgBtn: {
    marginTop: spacing[4],
    height: 48,
    paddingHorizontal: spacing[8],
    borderRadius: borderRadius.full,
    backgroundColor: WHITE,
    justifyContent: 'center',
  },
  msgBtnText: { color: '#000000', fontSize: typography.fontSize.base, ...font('semibold') },
});
