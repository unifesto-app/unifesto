import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { CaretRight } from 'phosphor-react-native';
import { UnIcon, IconName } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

type PermStatus = 'granted' | 'denied' | 'undetermined';
type PermKey = 'camera' | 'mediaLibrary' | 'location';

type ExpoPermission = { status: string };

const PERMISSIONS: {
  key: PermKey;
  label: string;
  icon: IconName;
  get: () => Promise<ExpoPermission>;
  request: () => Promise<ExpoPermission>;
}[] = [
  {
    key: 'camera',
    label: 'Camera',
    icon: 'camera',
    get: ImagePicker.getCameraPermissionsAsync,
    request: ImagePicker.requestCameraPermissionsAsync,
  },
  {
    key: 'mediaLibrary',
    label: 'Photos',
    icon: 'photo',
    get: ImagePicker.getMediaLibraryPermissionsAsync,
    request: ImagePicker.requestMediaLibraryPermissionsAsync,
  },
  {
    key: 'location',
    label: 'Location',
    icon: 'maps',
    get: Location.getForegroundPermissionsAsync,
    request: Location.requestForegroundPermissionsAsync,
  },
];

const toStatus = (s: string): PermStatus =>
  s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined';

const STATUS_LABEL: Record<PermStatus, string> = {
  granted: 'Allowed',
  denied: 'Not allowed',
  undetermined: 'Not asked',
};

/**
 * Shows each permission's state and makes it actionable: never asked → show
 * the system prompt; already decided → open the app's page in Settings (iOS
 * and Android only let the OS change a decided permission). Re-checks when
 * the app comes back to the foreground, e.g. returning from Settings.
 */
export default function PermissionsScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [statuses, setStatuses] = useState<Record<PermKey, PermStatus>>({
    camera: 'undetermined',
    mediaLibrary: 'undetermined',
    location: 'undetermined',
  });
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

  const handlePress = async (perm: (typeof PERMISSIONS)[number]) => {
    if (statuses[perm.key] === 'undetermined') {
      try {
        await perm.request();
      } finally {
        await checkPermissions();
      }
      return;
    }
    Linking.openSettings();
  };

  const statusColor: Record<PermStatus, string> = {
    granted: tokens.success,
    denied: tokens.danger,
    undetermined: tokens.textMuted,
  };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
      }
    >
      <SettingsGroup title="App permissions">
        {PERMISSIONS.map((perm) => {
          const status = statuses[perm.key];
          return (
            <SettingsRow
              key={perm.key}
              icon={<UnIcon name={perm.icon} size={28} />}
              label={perm.label}
              onPress={() => handlePress(perm)}
              trailing={
                <View style={styles.trailing}>
                  <Text style={[styles.status, { color: statusColor[status] }]}>{STATUS_LABEL[status]}</Text>
                  <CaretRight size={15} color={tokens.textMuted} />
                </View>
              }
            />
          );
        })}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[6], paddingBottom: 100 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  status: { fontSize: typography.fontSize.sm, ...font('medium') },
});
