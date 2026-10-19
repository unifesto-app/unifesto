import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { CardBackdrop } from '../../components/ui/CardSurface';
import SegmentedTabs from '../../components/ui/SegmentedTabs';
import { AppAlert } from '../../components/ui/AppAlert';
import { Badge, Button, type BadgeTone } from '../../components/ui';
import { buildInfo } from '../../lib/appBuild';
import {
  getOtaAdoption,
  getOtaGroups,
  getOtaStaleness,
  republishOtaGroup,
  revertOtaRollout,
  setOtaRollout,
  type OtaAdoption,
  type OtaChannel,
  type OtaGroup,
  type OtaStaleness,
} from '../../lib/api/apex';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Apex › OTA updates: what's published on each EAS Update channel, and the
 * rollout controls from mobile/docs/OTA.md (promote, revert, roll back) without
 * a laptop. Publishing new code stays in the CLI. On top: the stale-OTA alarm
 * (mobile commits on main nobody has received yet, and whether main can still
 * ship as an OTA) and what active phones actually run.
 */

const GUTTER = spacing[6];
const CHANNELS: { key: OtaChannel; label: string }[] = [
  { key: 'production', label: 'Production' },
  { key: 'preview', label: 'Preview' },
];

type State = 'rollout' | 'live' | 'embedded' | 'past';

/**
 * Newest first, per runtime: a staged rollout sits on top of the live update;
 * the first finished update is what everyone on that runtime runs; older ones
 * are past (and can be republished to roll back).
 */
function labelGroups(groups: OtaGroup[]): Map<string, State> {
  const out = new Map<string, State>();
  const settled = new Set<string>();
  for (const g of groups) {
    if (settled.has(g.runtimeVersion)) out.set(g.group, 'past');
    else if (g.rolloutPercentage != null) out.set(g.group, 'rollout');
    else {
      out.set(g.group, g.isRollBackToEmbedded ? 'embedded' : 'live');
      settled.add(g.runtimeVersion);
    }
  }
  return out;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const platformLabel = (p: string[]) => p.map((x) => (x === 'ios' ? 'iOS' : x === 'android' ? 'Android' : x)).join(' · ');

export default function OtaUpdatesScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const mine = buildInfo();
  const [channel, setChannel] = useState<OtaChannel>('production');
  const [groups, setGroups] = useState<OtaGroup[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stale, setStale] = useState<OtaStaleness | null>(null);
  const [adoption, setAdoption] = useState<OtaAdoption | null>(null);

  const load = useCallback(async (ch: OtaChannel) => {
    const res = await getOtaGroups(ch);
    if (res.ok) {
      setGroups(res.data.groups);
      setError('');
    } else {
      setGroups(null);
      setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
    }
  }, []);

  /** Channel-independent: the alarm and adoption. Failures just hide the cards. */
  const loadHealth = useCallback(async () => {
    const [st, ad] = await Promise.all([getOtaStaleness(), getOtaAdoption()]);
    setStale(st.ok ? st.data : null);
    setAdoption(ad.ok ? ad.data : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(channel);
    }, [load, channel]),
  );
  useFocusEffect(
    useCallback(() => {
      void loadHealth();
    }, [loadHealth]),
  );

  const switchChannel = (ch: OtaChannel) => {
    setGroups(null);
    setError('');
    setChannel(ch);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(channel), loadHealth()]);
    setRefreshing(false);
  };

  /** Confirm, run, reload. Every action changes what real phones download. */
  const act = (g: OtaGroup, title: string, message: string, confirm: string, run: () => ReturnType<typeof setOtaRollout>, destructive = false) =>
    AppAlert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirm,
        style: destructive ? 'destructive' : 'default',
        onPress: async () => {
          setBusy(g.group);
          const res = await run();
          setBusy(null);
          if (!res.ok) AppAlert.alert('Didn’t work', res.message);
          await load(channel);
        },
      },
    ]);

  const states = groups ? labelGroups(groups) : new Map<string, State>();
  const badge = (s: State, g: OtaGroup): { label: string; tone: BadgeTone } =>
    s === 'rollout'
      ? { label: `Rolling out · ${g.rolloutPercentage}%`, tone: 'warning' }
      : s === 'live'
        ? { label: 'Live', tone: 'success' }
        : s === 'embedded'
          ? { label: 'Rolled back to store build', tone: 'danger' }
          : { label: 'Past', tone: 'neutral' };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />}
    >
      {stale ? <StaleCard s={stale} /> : null}
      {adoption ? <AdoptionCard a={adoption} groups={channel === 'production' ? groups : null} /> : null}

      <SegmentedTabs tabs={CHANNELS} value={channel} onChange={switchChannel} />
      <Text style={[styles.hint, { color: tokens.textMuted }]}>
        This phone: {mine.channel ?? 'no channel'} · runtime {mine.runtimeVersion?.slice(0, 7) ?? '–'} ·{' '}
        {mine.updateId ? `update ${mine.updateId.slice(0, 7)}` : 'store build code'}
      </Text>

      {!groups ? (
        <View style={styles.center}>
          {error ? <Text style={[styles.body, { color: tokens.textMuted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
        </View>
      ) : groups.length === 0 ? (
        <Text style={[styles.body, styles.center, { color: tokens.textMuted }]}>Nothing published on {channel} yet.</Text>
      ) : (
        <View style={styles.list}>
          {groups.map((g) => {
            const s = states.get(g.group) ?? 'past';
            const b = badge(s, g);
            const pct = g.rolloutPercentage ?? 0;
            const isMine = !!mine.updateId && g.updateIds.includes(mine.updateId);
            return (
              <View key={g.group} style={styles.card}>
                <CardBackdrop />
                <View style={styles.head}>
                  <Badge label={b.label} tone={b.tone} />
                  {isMine ? <Badge label="This phone" tone="accent" /> : null}
                </View>
                <Text style={[styles.title, { color: tokens.text }]} numberOfLines={3}>
                  {g.isRollBackToEmbedded ? 'Roll back to the store build’s code' : g.message || 'No message'}
                </Text>
                <Text style={[styles.small, { color: tokens.textMuted }]}>
                  {when(g.createdAt)}
                  {g.publishedBy ? ` · ${g.publishedBy}` : ''} · {platformLabel(g.platforms)}
                </Text>
                <Text style={[styles.small, { color: tokens.textMuted }]}>
                  Runtime {g.runtimeVersion.slice(0, 7)} · group {g.group.slice(0, 8)}
                  {g.gitCommitHash ? ` · ${g.gitCommitHash.slice(0, 7)}` : ''}
                </Text>

                {s === 'rollout' ? (
                  <>
                    <View style={[styles.track, { backgroundColor: tokens.border }]}>
                      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tokens.warning }]} />
                    </View>
                    <View style={styles.actions}>
                      {pct < 50 ? (
                        <Button
                          label="50%"
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onPress={() => act(g, 'Raise to 50%?', 'Half of the phones on this runtime will get it.', 'Raise', () => setOtaRollout(g.group, 50))}
                        />
                      ) : null}
                      <Button
                        label="Promote to 100%"
                        size="sm"
                        loading={busy === g.group}
                        disabled={!!busy}
                        onPress={() =>
                          act(g, 'Promote to everyone?', 'Check Crashlytics (filter by update_id) first. Every phone on this runtime will get it.', 'Promote', () =>
                            setOtaRollout(g.group, 100),
                          )
                        }
                      />
                      <Button
                        label="Revert"
                        size="sm"
                        variant="danger"
                        disabled={!!busy}
                        onPress={() =>
                          act(
                            g,
                            'Revert this rollout?',
                            'Deletes it and republishes the update before it, so phones that got it go back. Takes up to a minute.',
                            'Revert',
                            () => revertOtaRollout(g.group),
                            true,
                          )
                        }
                      />
                    </View>
                  </>
                ) : s === 'past' && !g.isRollBackToEmbedded ? (
                  <View style={styles.actions}>
                    <Button
                      label="Roll back to this"
                      size="sm"
                      variant="secondary"
                      loading={busy === g.group}
                      disabled={!!busy}
                      onPress={() =>
                        act(
                          g,
                          'Roll back to this update?',
                          `Republishes it as the newest update on ${channel}. Every phone on runtime ${g.runtimeVersion.slice(0, 7)} moves to it.`,
                          'Roll back',
                          () => republishOtaGroup(g.group),
                          true,
                        )
                      }
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.hint, { color: tokens.textMuted }]}>
        Publish new updates with `npm run update:production` (starts at 20%). Rolling back to the store build is CLI-only:
        `npm run update:rollback`.
      </Text>
    </ScrollView>
  );
}

/** O12: "nothing shipped for 10 days" made visible. Production only. */
function StaleCard({ s }: { s: OtaStaleness }) {
  const tokens = useTokens();
  const n = s.unshippedCommits;
  const count = n == null ? null : `${n}${s.unshippedTruncated ? '+' : ''}`;
  const old = s.oldestUnshippedAt ? daysAgo(s.oldestUnshippedAt) : 0;
  const tone: BadgeTone = !n ? 'success' : old >= 7 ? 'danger' : 'warning';
  return (
    <View style={[styles.card, styles.section]}>
      <CardBackdrop />
      <View style={styles.head}>
        {count != null ? <Badge label={n ? `${count} unshipped` : 'Up to date'} tone={tone} /> : null}
        {s.main ? (
          <Badge label={s.main.otaSafe ? 'Main is OTA-safe' : 'Main needs a store build'} tone={s.main.otaSafe ? 'success' : 'danger'} />
        ) : null}
      </View>
      {!s.main ? (
        <Text style={[styles.body, { color: tokens.textMuted }]}>
          No report from CI yet. It posts after the next push to main that touches mobile/.
        </Text>
      ) : (
        <>
          <Text style={[styles.title, { color: tokens.text }]}>
            {n == null
              ? 'Couldn’t compare main with the last publish.'
              : n === 0
                ? 'Every mobile commit on main is published.'
                : `${count} mobile commit${n === 1 ? '' : 's'} on main newer than the last production update${old ? `, oldest ${old} day${old === 1 ? '' : 's'} ago` : ''}.`}
          </Text>
          <Text style={[styles.small, { color: tokens.textMuted }]}>
            {s.lastPublish ? `Last publish ${when(s.lastPublish.createdAt)}` : s.expoError ? s.expoError : 'Nothing published yet'} · main{' '}
            {s.main.sha.slice(0, 7)} checked {when(s.main.reportedAt)}
          </Text>
          {!s.main.otaSafe ? (
            <Text style={[styles.small, { color: tokens.textMuted }]}>
              Main’s native fingerprint matches no live store build, so an OTA from main would reach nobody. Ship a store build.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** O13: share of active users on each runtime, and on each update within it. */
function AdoptionCard({ a, groups }: { a: OtaAdoption; groups: OtaGroup[] | null }) {
  const tokens = useTokens();
  const label = (id: string | null) => {
    if (!id) return 'Store build code';
    const g = groups?.find((x) => x.updateIds.includes(id));
    return g ? `${g.message || 'Update'} · ${g.group.slice(0, 8)}` : `Update ${id.slice(0, 8)}`;
  };
  const row = (key: string, text: string, users: number, total: number, indent = false) => (
    <View key={key} style={[styles.adoptRow, indent && { paddingLeft: spacing[3] }]}>
      <View style={styles.adoptHead}>
        <Text style={[indent ? styles.small : styles.body, { color: indent ? tokens.textMuted : tokens.text, flex: 1 }]} numberOfLines={1}>
          {text}
        </Text>
        <Text style={[styles.small, { color: tokens.textMuted }]}>
          {users} · {pct(users, total)}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: tokens.border }]}>
        <View style={[styles.fill, { width: `${pct(users, total)}%`, backgroundColor: indent ? tokens.textMuted : tokens.accent }]} />
      </View>
    </View>
  );
  return (
    <View style={[styles.card, styles.section]}>
      <CardBackdrop />
      <Text style={[styles.title, { color: tokens.text }]}>What phones run</Text>
      <Text style={[styles.small, { color: tokens.textMuted }]}>
        {a.total} active user{a.total === 1 ? '' : 's'} (app reported in the last {a.days} days)
      </Text>
      {a.byRuntime.map((r) => (
        <View key={r.runtimeVersion ?? 'none'} style={styles.adoptGroup}>
          {row(r.runtimeVersion ?? 'none', r.runtimeVersion ? `Runtime ${r.runtimeVersion.slice(0, 7)}` : 'Older app (doesn’t report)', r.users, a.total)}
          {a.byUpdate
            .filter((u) => u.runtimeVersion === r.runtimeVersion)
            .map((u) => row(`${r.runtimeVersion}:${u.updateId}`, label(u.updateId), u.users, a.total, true))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing[3] },
  adoptGroup: { gap: spacing[2], marginTop: spacing[2] },
  adoptRow: { gap: spacing[1] },
  adoptHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { paddingVertical: spacing[12], alignItems: 'center' },
  list: { marginTop: spacing[4], gap: spacing[3] },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4], gap: spacing[2] },
  head: { flexDirection: 'row', gap: spacing[2] },
  title: { fontSize: typography.fontSize.base, ...font('medium') },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  small: { fontSize: typography.fontSize.xs, ...font() },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: spacing[1] },
  fill: { height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
  hint: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
