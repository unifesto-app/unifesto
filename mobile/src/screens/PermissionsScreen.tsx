import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { CheckCircle } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import OneSignalService from '../services/OneSignalService';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

type PermStatus = 'granted' | 'denied' | 'undetermined';
type PermKey = 'notifications' | 'camera' | 'mediaLibrary' | 'location' | 'microphone';

type ExpoPermission = { status: string };

// Most useful first: the order holds inside both sections.
const PERMISSIONS: {
  key: PermKey;
  label: string;
  /** What it unlocks, in the user's terms (matches the OS purpose strings). */
  why: string;
  icon: GlyphName;
  get: () => Promise<ExpoPermission>;
  request: () => Promise<unknown>;
}[] = [
  {
    key: 'notifications',
    label: 'Notifications',
    why: 'Waitlist spots, reminders and word from hosts',
    icon: 'bell',
    get: Notifications.getPermissionsAsync,
    // Through OneSignal so the push subscription opts in along with the OS.
    request: () => OneSignalService.requestPermission(),
  },
  {
    key: 'camera',
    label: 'Camera',
    why: 'Scan passes at the door and booths, take photos',
    icon: 'camera',
    get: ImagePicker.getCameraPermissionsAsync,
    request: ImagePicker.requestCameraPermissionsAsync,
  },
  {
    key: 'mediaLibrary',
    label: 'Photos',
    why: 'Choose a profile photo, covers and uploads',
    icon: 'image-square',
    get: ImagePicker.getMediaLibraryPermissionsAsync,
    request: ImagePicker.requestMediaLibraryPermissionsAsync,
  },
  {
    key: 'location',
    label: 'Location',
    why: 'Find events near you, only while you use the app',
    icon: 'map-pin',
    get: Location.getForegroundPermissionsAsync,
    request: Location.requestForegroundPermissionsAsync,
  },
  {
    key: 'microphone',
    label: 'Microphone',
    why: 'Speak in live sessions',
    icon: 'microphone',
    get: Camera.getMicrophonePermissionsAsync,
    request: Camera.requestMicrophonePermissionsAsync,
  },
];

type Perm = (typeof PERMISSIONS)[number];

const toStatus = (s: string): PermStatus =>
  s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined';

/**
 * Profile › Permissions. What still needs a decision comes first, each with
 * the one action that works: never asked → the system prompt; already turned
 * down → this app's page in Settings (only the OS can change a decided
 * permission). Everything allowed sits below. Re-checks when the app returns
 * to the foreground, e.g. coming back from Settings.
 */
export default function PermissionsScreen() {
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [statuses, setStatuses] = useState<Record<PermKey, PermStatus> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkPermissions = useCallback(async () => {
    const results = await Promise.all(PERMISSIONS.map((p) => p.get().catch(() => ({ status: 'undetermined' }))));
    setStatuses(
      Object.fromEntries(PERMISSIONS.map((p, i) => [p.key, toStatus(results[i].status)])) as Record<PermKey, PermStatus>,
    );
  }, []);

  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermissions();
    });
    return () => sub.remove();
  }, [checkPermissions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await checkPermissions();
    setRefreshing(false);
  }, [checkPermissions]);

  const act = async (perm: Perm) => {
    if (statuses?.[perm.key] !== 'undetermined') {
      Linking.openSettings();
      return;
    }
    try {
      await perm.request();
    } finally {
      await checkPermissions();
    }
  };

  const pending = statuses ? PERMISSIONS.filter((p) => statuses[p.key] !== 'granted') : [];
  const allowed = statuses ? PERMISSIONS.filter((p) => statuses[p.key] === 'granted') : [];

  const card = (perm: Perm) => {
    const status = statuses?.[perm.key] ?? 'undetermined';
    const granted = status === 'granted';
    return (
      <Pressable
        key={perm.key}
        onPress={() => act(perm)}
        accessibilityRole="button"
        accessibilityLabel={`${perm.label}, ${granted ? 'allowed' : status === 'denied' ? 'not allowed' : 'not asked yet'}`}
        accessibilityHint={status === 'undetermined' ? 'Shows the permission prompt' : 'Opens Settings'}
        style={({ pressed }) => [styles.card, { backgroundColor: c.raised, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
      >
        <UnGlyph name={perm.icon} size={28} color={c.text} />
        <View style={styles.info}>
          <Text style={[styles.label, { color: c.text }]}>{perm.label}</Text>
          <Text style={[styles.why, { color: c.soft }]}>{perm.why}</Text>
        </View>
        {granted ? (
          <CheckCircle size={20} color={c.text} weight="fill" />
        ) : (
          <Text style={[styles.action, { color: c.text }]}>{status === 'denied' ? 'Settings' : 'Allow'}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
        }
      >
        {!statuses ? null : pending.length === 0 ? (
          <View style={[styles.summary, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text style={[styles.summaryTitle, { color: c.text }]}>All set</Text>
            <Text style={[styles.summaryBody, { color: c.soft }]}>
              Everything Unifesto can use is allowed. Change any of it in Settings whenever you like.
            </Text>
          </View>
        ) : (
          <Section title="Needs a look" subtitle={`${pending.length} of ${PERMISSIONS.length} not allowed yet`} style={styles.firstSection}>
            <View style={[styles.list, styles.pad]}>{pending.map(card)}</View>
          </Section>
        )}

        {allowed.length > 0 ? (
          <Section title="Allowed" subtitle="Tap one to change it in Settings">
            <View style={[styles.list, styles.pad]}>{allowed.map(card)}</View>
          </Section>
        ) : null}

        {statuses ? (
          <View style={[styles.pad, { marginTop: spacing[10] }]}>
            <AuthButton label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
            <Text style={[styles.note, { color: c.muted }]}>Changes you make there show here when you come back.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  // Section's default top margin is sized for Home; tighter at the top of a page.
  firstSection: { marginTop: spacing[6] },
  list: { gap: spacing[3] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
    borderRadius: cosmosCardRadius,
  },
  info: { flex: 1, gap: 2 },
  label: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  why: { fontSize: typography.fontSize.xs, lineHeight: 17, ...cosmosFont.body },
  action: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  summary: { marginHorizontal: GUTTER, marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  summaryTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  summaryBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  note: { marginTop: spacing[3], textAlign: 'center', fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
