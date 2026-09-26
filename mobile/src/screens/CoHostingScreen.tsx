import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowsLeftRight, Crown, MagnifyingGlass } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  acceptOwnership,
  addCoHost,
  cancelOwnershipOffer,
  declineOwnership,
  getCoHosts,
  offerOwnership,
  removeCoHost,
  searchSpaces,
  type CoHosts,
  type CoHostSpace,
} from '../lib/api/coHosts';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const AVATAR = 30;

function SpaceAvatar({ space }: { space: CoHostSpace }) {
  const tokens = useTokens();
  if (space.logoUrl) return <Image source={{ uri: space.logoUrl }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: tokens.elevated }]}>
      <Text style={[styles.initials, { color: tokens.textMuted }]}>{space.name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

/**
 * Spaces that co-host this event. The host space's admins invite co-hosts and
 * can offer them ownership; a co-host can leave. Which side "I" am on comes
 * from the spaces this user is a Space Admin of.
 */
export default function CoHostingScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { spaces, refresh: refreshAccess } = useSpaceAccess();

  const [data, setData] = useState<CoHosts | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoHostSpace[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useAnalyticsScreenTracking('CoHosting');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getCoHosts(eventId);
    if (res.ok) {
      setData(res.data);
      setLoadError('');
    } else {
      setLoadError(res.denied ? "You can't manage this event's hosts." : res.message);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced space search; a newer query drops older answers.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchSpaces(q);
      if (mine !== seq.current) return;
      setResults(res.ok ? res.data : []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const adminOf = new Set(spaces.filter((s) => s.userRole?.code === 'SPACE_ADMIN').map((s) => s.id));
  const isHostAdmin = !!data && adminOf.has(data.owner.id);
  const pending = data?.pendingTransfer ?? null;
  const iReceive = !!pending && adminOf.has(pending.toSpace.id);
  const iOffered = !!pending && adminOf.has(pending.fromSpace.id);
  const taken = new Set([data?.owner.id, ...(data?.coHosts ?? []).map((c) => c.space.id)]);

  /** Run one write, then reload; `after` runs only on success. */
  const act = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't do that", (res as { message: string }).message);
      return;
    }
    after?.();
    await load();
  };

  const invite = (s: CoHostSpace) =>
    act(`invite:${s.id}`, () => addCoHost(eventId!, s.id), () => {
      setQuery('');
      setResults([]);
    });

  const remove = (s: CoHostSpace) => {
    const leaving = adminOf.has(s.id) && !isHostAdmin;
    AppAlert.alert(leaving ? `Leave as co-host?` : `Remove ${s.name}?`, leaving ? 'Your space loses access to this event.' : undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: leaving ? 'Leave' : 'Remove',
        style: 'destructive',
        onPress: () =>
          act(`remove:${s.id}`, () => removeCoHost(eventId!, s.id), async () => {
            if (leaving) {
              await refreshAccess();
              router.navigate('/(tabs)/space');
            }
          }),
      },
    ]);
  };

  const makeHost = (s: CoHostSpace) =>
    AppAlert.alert(
      `Offer ownership to ${s.name}?`,
      `Nothing changes until they accept. Then this event's payouts and management move to ${s.name}, and your space is removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Offer', onPress: () => act('offer', () => offerOwnership(eventId!, s.id)) },
      ],
    );

  const accept = () =>
    AppAlert.alert('Accept ownership?', "This event's payouts and management move to your space.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: () => act('accept', () => acceptOwnership(eventId!), () => void refreshAccess()) },
    ]);

  const decline = () =>
    AppAlert.alert('Decline this offer?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => act('decline', () => declineOwnership(eventId!)) },
    ]);

  const cancelOffer = () =>
    AppAlert.alert('Withdraw the offer?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => act('cancel', () => cancelOwnershipOffer(eventId!)) },
    ]);

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {/* Pending ownership offer: receiver answers, proposer can withdraw. */}
      {pending ? (
        <View style={styles.offer}>
          <CardBackdrop />
          <View style={styles.offerHead}>
            <ArrowsLeftRight size={22} color={tokens.accent} weight="bold" />
            <Text style={[styles.offerTitle, { color: tokens.text }]}>
              {iReceive
                ? `${pending.fromSpace.name} wants to make you the host`
                : iOffered
                  ? `Waiting for ${pending.toSpace.name} to accept`
                  : 'Ownership change pending'}
            </Text>
          </View>
          <Text style={[styles.offerBody, { color: tokens.textSecondary }]}>
            {iReceive
              ? `Accepting moves this event's payouts and management to your space. ${pending.fromSpace.name} will be removed as host.`
              : iOffered
                ? 'Nothing changes until they accept.'
                : `${pending.fromSpace.name} offered this event to ${pending.toSpace.name}.`}
          </Text>
          {pending.reason ? <Text style={[styles.quote, { color: tokens.textMuted }]}>“{pending.reason}”</Text> : null}
          {iReceive ? (
            <View style={styles.offerActions}>
              <Button label="Accept" onPress={accept} loading={busy === 'accept'} style={{ flex: 1 }} />
              <Button label="Decline" variant="secondary" onPress={decline} loading={busy === 'decline'} style={{ flex: 1 }} />
            </View>
          ) : iOffered ? (
            <Button label="Withdraw offer" variant="secondary" onPress={cancelOffer} loading={busy === 'cancel'} style={{ marginTop: spacing[4] }} />
          ) : null}
        </View>
      ) : null}

      {/* Invite: host admins only, and not while ownership is changing hands. */}
      {isHostAdmin && !pending ? (
        <>
          <View style={styles.search}>
            <CardBackdrop shape={styles.search} />
            <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Invite a space by name"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              autoCorrect={false}
              style={[styles.searchInput, { color: tokens.text }]}
            />
            {searching ? <ActivityIndicator size="small" color={tokens.accent} /> : null}
          </View>
          {query.trim().length >= 2 && !searching ? (
            <SettingsGroup>
              {results.length === 0 ? (
                <SettingsRow label="No spaces found" />
              ) : (
                results.map((s) => (
                  <SettingsRow
                    key={s.id}
                    icon={<SpaceAvatar space={s} />}
                    label={s.name}
                    value={taken.has(s.id) ? (s.id === data.owner.id ? 'Host' : 'Added') : undefined}
                    trailing={
                      taken.has(s.id) ? <View /> : busy === `invite:${s.id}` ? <ActivityIndicator size="small" color={tokens.accent} /> : (
                        <Text style={[styles.link, { color: tokens.accent }]}>Invite</Text>
                      )
                    }
                    onPress={taken.has(s.id) || busy ? undefined : () => void invite(s)}
                  />
                ))
              )}
            </SettingsGroup>
          ) : null}
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Co-host admins get full management of this event, and it shows in their event list.
          </Text>
        </>
      ) : null}

      <SettingsGroup title="Hosts">
        <SettingsRow
          icon={<SpaceAvatar space={data.owner} />}
          label={data.owner.name}
          trailing={
            <View style={styles.hostTag}>
              <Crown size={14} color={tokens.accent} weight="fill" />
              <Text style={[styles.hostText, { color: tokens.accent }]}>Host</Text>
            </View>
          }
        />
        {data.coHosts.map((c) => {
          const canRemove = isHostAdmin || adminOf.has(c.space.id);
          return (
            <View key={c.id}>
              <SettingsRow icon={<SpaceAvatar space={c.space} />} label={c.space.name} value="Co-host" />
              {(isHostAdmin && !pending) || canRemove ? (
                <View style={styles.rowActions}>
                  {isHostAdmin && !pending ? (
                    <Pressable onPress={() => makeHost(c.space)} hitSlop={8} disabled={!!busy}>
                      <Text style={[styles.link, { color: tokens.accent }]}>Make host</Text>
                    </Pressable>
                  ) : null}
                  {canRemove ? (
                    <Pressable onPress={() => remove(c.space)} hitSlop={8} disabled={!!busy}>
                      <Text style={[styles.link, { color: tokens.danger }]}>
                        {adminOf.has(c.space.id) && !isHostAdmin ? 'Leave' : 'Remove'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </SettingsGroup>
      {data.coHosts.length === 0 ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {isHostAdmin ? 'No co-hosts yet. Search above to invite a space.' : 'This event has no co-hosts.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: borderRadius.md },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 11, ...font('semibold') },
  offer: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[5], marginBottom: spacing[2] },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  offerTitle: { flex: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  offerBody: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  quote: { marginTop: spacing[3], fontSize: typography.fontSize.sm, fontStyle: 'italic', ...font() },
  offerActions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: borderRadius.xl, paddingHorizontal: spacing[4], height: 48 },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  hostTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hostText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[5], paddingHorizontal: spacing[4], paddingBottom: spacing[3] },
});
