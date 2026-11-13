import React, { useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import useTopSpacing from '../hooks/useTopSpacing';
import { buildInfo, buildLabel } from '../lib/appBuild';
import { checkForOtaNow, restartIntoUpdate } from '../lib/otaUpdate';
import { getStoreUpdate, openStoreListing, type StoreUpdate } from '../lib/appUpdate';
import { currentAppIconPreview } from '../lib/appIcon';
import { openStoreReview } from '../utils/storeReview';
import BrandWordmark from '../components/BrandWordmark';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { GUTTER, Section } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const STORE = Platform.OS === 'ios' ? 'App Store' : 'Play Store';
const ICON = 88;
/** The web's download page: sends each phone to its own store. */
const APP_LINK = 'https://unifesto.app/app';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

type Status =
  | { kind: 'idle' | 'checking' | 'current' | 'error' }
  | { kind: 'store'; update: StoreUpdate };

/**
 * Profile › About and updates: my app icon and version up top, one row that
 * says where this install stands with the single next step (check, restart,
 * open the store), ways to pass Unifesto on, then the exact build details for
 * support. Release notes live in the What's new sheet.
 */
export default function AboutScreen() {
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const info = useMemo(buildInfo, []);
  // expo-updates' own state: also true when a foreground check downloaded one.
  const { isUpdatePending } = Updates.useUpdates();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const icon = useMemo(currentAppIconPreview, []);

  const checkNow = async () => {
    setStatus({ kind: 'checking' });
    const ota = await checkForOtaNow();
    if (ota === 'downloaded') return setStatus({ kind: 'idle' }); // isUpdatePending takes over
    if (ota === 'error') return setStatus({ kind: 'error' });
    // Nothing over the air: see whether the store has a newer version.
    const store = await getStoreUpdate();
    if (store === 'unreachable') return setStatus({ kind: 'error' });
    setStatus(store && store.kind !== 'current' ? { kind: 'store', update: store } : { kind: 'current' });
  };

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

  const check = () => void checkNow();
  // Where this install stands, as one row: the next step in the accent, the state as its value.
  const update: { label: string; value?: string; onPress: () => void } = isUpdatePending
    ? { label: 'Restart to update', value: 'Update ready', onPress: restartIntoUpdate }
    : status.kind === 'store'
      ? {
          label: `Open ${STORE}`,
          value: status.update.kind === 'force' ? 'Update required' : `Version ${status.update.info.latestVersion} is out`,
          onPress: () => openStoreListing(status.update.info),
        }
      : status.kind === 'current'
        ? { label: 'Check again', value: 'Up to date', onPress: check }
        : status.kind === 'error'
          ? { label: 'Try again', value: 'Couldn’t check', onPress: check }
          : status.kind === 'checking'
            ? { label: 'Checking…', onPress: () => {} }
            : {
                label: 'Check for updates',
                value: info.updateCreatedAt ? `Updated ${when(info.updateCreatedAt)}` : undefined,
                onPress: check,
              };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[column, styles.content, { paddingTop: topSpacing }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={icon} style={styles.icon} accessibilityLabel="Your Unifesto app icon" />
          <BrandWordmark width={150} />
          <Text style={[styles.version, { color: c.text }]}>Version {info.version ?? '–'}</Text>
          <Text style={[styles.build, { color: c.muted }]}>
            {info.build ? `Build ${info.build}` : ''}
            {info.updateId ? ` · update ${info.updateId.slice(0, 7)}` : ''}
          </Text>
        </View>

        <Section title="Updates" style={styles.firstSection}>
          <SettingsGroup plain style={styles.group}>
            <SettingsRow label={update.label} value={update.value} accent={c.sky} onPress={update.onPress} />
          </SettingsGroup>
        </Section>

        <Section title="Spread the word" style={styles.section}>
          <SettingsGroup plain style={styles.group}>
            <SettingsRow
              label="Share Unifesto"
              onPress={() => Share.share({ message: `Find events and the people going on Unifesto: ${APP_LINK}`, url: APP_LINK }).catch(() => {})}
            />
            <SettingsRow label={`Rate on the ${STORE}`} external onPress={() => openStoreReview().catch(() => {})} />
            <SettingsRow label="unifesto.app" external onPress={() => Linking.openURL('https://unifesto.app').catch(() => {})} />
          </SettingsGroup>
        </Section>

        <Section title="For support" style={styles.section}>
          <SettingsGroup plain style={styles.group}>
            <SettingsRow label="Version" value={buildLabel(info)} />
            <SettingsRow label="Platform" value={info.platform} />
            <SettingsRow label="Runtime" value={info.runtimeVersion ? info.runtimeVersion.slice(0, 12) : '–'} />
            <SettingsRow label="Channel" value={info.channel ?? '–'} />
            <SettingsRow label="Update" value={info.updateId ? info.updateId.slice(0, 13) : 'Built-in'} />
            {info.emergencyLaunch ? <SettingsRow label="Recovered from a failed update" value="Yes" /> : null}
            <SettingsRow label="Copy all details" accent={c.sky} onPress={() => void copyDetails()} />
          </SettingsGroup>
        </Section>
        <Text style={[styles.footer, { color: c.muted }]}>© {new Date().getFullYear()} Unifesto</Text>
        {/* Flaticon's free licence: credit the Profile tab's icons where people can see it. */}
        <Text
          style={[styles.credit, { color: c.muted }]}
          accessibilityRole="link"
          onPress={() => Linking.openURL('https://www.flaticon.com/authors/sonnycandra').catch(() => {})}
        >
          Profile icons by sonnycandra from Flaticon
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 80 },
  hero: { alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: spacing[6], paddingBottom: spacing[8] },
  // Same corner share as an iOS home-screen icon (~22%).
  icon: { width: ICON, height: ICON, borderRadius: ICON * 0.22, marginBottom: spacing[5] },
  version: { marginTop: spacing[4], fontSize: 17, lineHeight: 24, ...cosmosFont.figure },
  build: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  // The hero already spaces the first section; settings pages step by spacing[8] after it.
  firstSection: { marginTop: 0 },
  section: { marginTop: spacing[8] },
  footer: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.xs, ...cosmosFont.body },
  credit: { marginTop: spacing[2], textAlign: 'center', fontSize: typography.fontSize.xs, ...cosmosFont.body },
  // The SettingsGroup default top margin doubles Section's; Section owns spacing.
  group: { marginTop: 0, marginHorizontal: GUTTER },
});
