import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { buildInfo, buildLabel } from '../lib/appBuild';
import { checkForOtaNow, restartIntoUpdate } from '../lib/otaUpdate';
import { checkForAppUpdate } from '../lib/appUpdate';
import { WHATS_NEW } from '../lib/whatsNew';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '';

/**
 * Profile › About: exactly what's running (store build, runtime, OTA update),
 * a manual update check, and this release's notes. Tap the details to copy
 * them for a support chat.
 */
export default function AboutScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const info = useMemo(buildInfo, []);
  const [checking, setChecking] = useState(false);

  useAnalyticsScreenTracking('About');

  const copyDetails = async () => {
    const text = [
      `Unifesto ${buildLabel(info)}`,
      `Platform: ${info.platform}`,
      `Runtime: ${info.runtimeVersion ?? '–'}`,
      `Channel: ${info.channel ?? '–'}`,
      `Update: ${info.updateId ?? 'built-in'}${info.updateCreatedAt ? ` (${info.updateCreatedAt})` : ''}`,
    ].join('\n');
    try {
      await Clipboard.setStringAsync(text);
      AppAlert.alert('Copied', 'Paste these details into a support chat.');
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  const checkNow = async () => {
    setChecking(true);
    const res = await checkForOtaNow();
    setChecking(false);
    if (res === 'downloaded') {
      AppAlert.alert('Update ready', 'Restart the app to use it now, or it applies the next time you open the app.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart now', onPress: restartIntoUpdate },
      ]);
    } else if (res === 'none' || res === 'disabled') {
      // Nothing over the air: see whether the store has a newer version.
      checkForAppUpdate({ manual: true });
    } else {
      AppAlert.alert('Couldn’t check', 'Check your connection and try again.');
    }
  };

  const latest = WHATS_NEW[0];

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.version, { color: tokens.text }]}>Unifesto {info.version ?? ''}</Text>
      <Text style={[styles.sub, { color: tokens.textMuted }]}>
        {info.updateId ? `Updated ${when(info.updateCreatedAt)}` : 'Running the version from the app store'}
      </Text>

      <SettingsGroup title="This install" plain>
        <SettingsRow label="Version" value={buildLabel(info)} onPress={copyDetails} />
        <SettingsRow label="Platform" value={info.platform} />
        <SettingsRow label="Runtime" value={info.runtimeVersion ? info.runtimeVersion.slice(0, 12) : '–'} />
        <SettingsRow label="Channel" value={info.channel ?? '–'} />
        <SettingsRow label="Update" value={info.updateId ? info.updateId.slice(0, 13) : 'Built-in'} onPress={copyDetails} />
        {info.emergencyLaunch ? <SettingsRow label="Recovered from a failed update" value="Yes" /> : null}
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>Tap Version to copy these details for support.</Text>

      <SettingsGroup>
        <SettingsRow
          label="Check for updates"
          trailing={checking ? <ActivityIndicator size="small" color={tokens.accent} /> : undefined}
          onPress={checking ? undefined : () => void checkNow()}
        />
      </SettingsGroup>

      {latest ? (
        <SettingsGroup title={`What’s new in ${latest.id}`} plain>
          {latest.items.map((item) => (
            <Text key={item} style={[styles.item, { color: tokens.text }]}>
              •  {item}
            </Text>
          ))}
        </SettingsGroup>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  version: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  sub: { marginTop: spacing[1], marginBottom: spacing[2], fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  item: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
