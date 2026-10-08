import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { buildInfo, buildLabel } from '../lib/appBuild';
import { checkForOtaNow, restartIntoUpdate } from '../lib/otaUpdate';
import { getStoreUpdate, openStoreListing, type StoreUpdate } from '../lib/appUpdate';
import { WHATS_NEW } from '../lib/whatsNew';
import BrandWordmark from '../components/BrandWordmark';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const STORE = Platform.OS === 'ios' ? 'App Store' : 'Play Store';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

type Status =
  | { kind: 'idle' | 'checking' | 'current' | 'error' }
  | { kind: 'store'; update: StoreUpdate };

/**
 * Profile › About and updates: one card that says where this install stands
 * and offers the single next step (check, restart, open the store), then the
 * release notes, then the exact build details for support.
 */
export default function AboutScreen() {
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const info = useMemo(buildInfo, []);
  // expo-updates' own state: also true when a foreground check downloaded one.
  const { isUpdatePending } = Updates.useUpdates();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useAnalyticsScreenTracking('About');

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
  const card: { title: string; body: string; action: React.ReactNode } = isUpdatePending
    ? {
        title: 'Update ready',
        body: 'Restart to use it now. Otherwise it applies the next time you open the app.',
        action: <AuthButton label="Restart now" arrow onPress={restartIntoUpdate} />,
      }
    : status.kind === 'store'
      ? {
          title: status.update.kind === 'force' ? 'Update required' : `Version ${status.update.info.latestVersion} is out`,
          body:
            status.update.kind === 'force'
              ? `This version is no longer supported. Get the latest from the ${STORE}.`
              : `Get it from the ${STORE} for the latest features and fixes.`,
          action: <AuthButton label={`Open ${STORE}`} arrow onPress={() => openStoreListing(status.update.info)} />,
        }
      : status.kind === 'current'
        ? {
            title: 'You’re up to date',
            body: 'Checked just now. Fixes also arrive on their own while you use the app.',
            action: <AuthButton label="Check again" variant="secondary" onPress={check} />,
          }
        : status.kind === 'error'
          ? {
              title: 'Couldn’t check',
              body: 'Check your connection and try again.',
              action: <AuthButton label="Try again" variant="secondary" onPress={check} />,
            }
          : {
              title: 'Updates',
              body: info.updateCreatedAt
                ? `Last updated ${when(info.updateCreatedAt)}. Fixes arrive on their own; check to get them now.`
                : `Running the version from the ${STORE}. Fixes arrive on their own; check to get them now.`,
              action: <AuthButton label="Check for updates" loading={status.kind === 'checking'} onPress={check} />,
            };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <BrandWordmark width={176} />
          <Text style={[styles.version, { color: c.text }]}>Version {info.version ?? '–'}</Text>
          <Text style={[styles.build, { color: c.muted }]}>
            {info.build ? `Build ${info.build}` : ''}
            {info.updateId ? ` · update ${info.updateId.slice(0, 7)}` : ''}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: c.raised }]}>
          <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
          <Text style={[styles.cardTitle, { color: c.text }]}>{card.title}</Text>
          <Text style={[styles.cardBody, { color: c.soft }]}>{card.body}</Text>
          <View style={{ marginTop: spacing[6] }}>{card.action}</View>
        </View>

        {WHATS_NEW.length ? (
          <Section title="What’s new">
            <View style={styles.notes}>
              {WHATS_NEW.map((entry, i) => (
                <View key={entry.id} style={[styles.release, i === 0 ? { paddingTop: 0 } : { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.releaseId, { color: i === 0 ? c.text : c.muted }]}>{entry.id}</Text>
                  {entry.items.map((item) => (
                    <View key={item} style={styles.item}>
                      <Text style={[styles.bullet, { color: c.muted }]}>•</Text>
                      <Text style={[styles.itemText, { color: i === 0 ? c.soft : c.muted }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="For support" subtitle="Share these if something isn’t working.">
          <SettingsGroup plain style={styles.group} action={{ label: 'Copy all', onPress: () => void copyDetails() }}>
            <SettingsRow label="Version" value={buildLabel(info)} />
            <SettingsRow label="Platform" value={info.platform} />
            <SettingsRow label="Runtime" value={info.runtimeVersion ? info.runtimeVersion.slice(0, 12) : '–'} />
            <SettingsRow label="Channel" value={info.channel ?? '–'} />
            <SettingsRow label="Update" value={info.updateId ? info.updateId.slice(0, 13) : 'Built-in'} />
            {info.emergencyLaunch ? <SettingsRow label="Recovered from a failed update" value="Yes" /> : null}
          </SettingsGroup>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 80 },
  hero: { alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: spacing[6], paddingBottom: spacing[8] },
  version: { marginTop: spacing[5], fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  build: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  card: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  cardTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  cardBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  notes: { paddingHorizontal: GUTTER },
  release: { paddingVertical: spacing[5] },
  releaseId: { fontSize: 15, lineHeight: 22, marginBottom: spacing[3], ...cosmosFont.display },
  item: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  bullet: { fontSize: typography.fontSize.sm, lineHeight: 21, ...cosmosFont.body },
  itemText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 21, ...cosmosFont.body },
  // The SettingsGroup default top margin doubles Section's; Section owns spacing.
  group: { marginTop: 0, marginHorizontal: GUTTER },
});
