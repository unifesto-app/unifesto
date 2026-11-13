import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { CheckCircle } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import PushService from '../services/PushService';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { GUTTER, Section } from '../components/home/Section';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

type PermStatus = 'granted' | 'denied' | 'undetermined';
type PermKey = 'notifications' | 'camera' | 'mediaLibrary' | 'location';

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
    // Through PushService so the answer is reported to the backend.
    request: () => PushService.requestPermission(),
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

  // One row of a card group: same padding and icon column as SettingsRow, so the rows line up.
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
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      >
        <View style={styles.icon}>
          <UnGlyph name={perm.icon} size={28} color={c.text} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.label, { color: c.text }]}>{perm.label}</Text>
          <Text style={[styles.why, { color: c.muted }]}>{perm.why}</Text>
        </View>
        {granted ? (
          <CheckCircle size={20} color={c.success} weight="fill" />
        ) : (
          <Text style={[styles.action, { color: c.text }]}>{status === 'denied' ? 'Settings' : 'Allow'}</Text>
        )}
      </Pressable>
    );
  };

  // Closes the last list. Changes made there show here on return (the AppState listener rechecks).
  const openSettings = (
    <SettingsRow
      key="open-settings"
      icon={<UnGlyph name="gear" size={28} color={c.sky} />}
      label="Open Settings"
      accent={c.sky}
      onPress={() => Linking.openSettings()}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
        }
      >
        {!statuses ? null : pending.length === 0 ? (
          <View style={styles.allSet} accessible accessibilityLabel="All set. Everything Unifesto can use is allowed.">
            <CheckCircle size={24} color={c.success} weight="fill" />
            <Text style={[styles.label, { color: c.text }]}>All set, everything is allowed</Text>
          </View>
        ) : (
          <Section title="Needs a look" style={styles.firstSection}>
            <SettingsGroup style={styles.group}>
              {pending.map(card)}
              {allowed.length === 0 ? openSettings : null}
            </SettingsGroup>
          </Section>
        )}

        {allowed.length > 0 ? (
          <Section title="Allowed" style={styles.section}>
            <SettingsGroup style={styles.group}>
              {allowed.map(card)}
              {openSettings}
            </SettingsGroup>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Section's default top margin is sized for Home; tighter at the top of a page.
  firstSection: { marginTop: spacing[6] },
  section: { marginTop: spacing[8] },
  // SettingsGroup's own top margin doubles Section's; Section owns spacing.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 64,
  },
  icon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  label: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  why: { fontSize: typography.fontSize.sm, lineHeight: 18, ...cosmosFont.body },
  action: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  allSet: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginHorizontal: GUTTER, marginTop: spacing[6] },
});
