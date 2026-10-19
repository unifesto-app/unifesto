import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { MagnifyingGlass, User } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  addTeamMember,
  getEventTeam,
  removeTeamMember,
  roleLabel,
  searchTeamCandidates,
  TEAM_ROLES,
  type TeamMember,
  type TeamUser,
} from '../lib/api/eventTeam';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const AVATAR = 30;

function Avatar({ user }: { user: TeamUser }) {
  const tokens = useTokens();
  return user.avatarUrl ? (
    <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
  ) : (
    <User size={AVATAR - 2} color={tokens.accent} weight="fill" />
  );
}

/**
 * Who runs this event. Search members of the space, pick a role, and remove
 * people. Changing someone's role is remove + add again with the new one.
 */
export default function EventTeamScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamUser[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getEventTeam(eventId);
    if (res.ok) {
      setMembers(res.data.members);
      setError('');
    } else {
      setError(res.denied ? "You can't manage this event's team." : res.message);
      setMembers((m) => m ?? []);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const res = await searchTeamCandidates(eventId!, q);
      if (mine !== seq.current) return;
      setResults(res.ok ? res.data.results : []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, eventId]);

  const onTeam = new Set((members ?? []).map((m) => m.userId));
  const nameOf = (u: TeamUser) => u.fullName || u.username || 'Member';

  const add = (u: TeamUser) =>
    AppAlert.alert(`Add ${nameOf(u)} as`, undefined, [
      ...TEAM_ROLES.map((r) => ({
        text: r.label,
        onPress: async () => {
          setBusy(u.id);
          const res = await addTeamMember(eventId!, u.id, r.code);
          setBusy(null);
          if (!res.ok) return AppAlert.alert("Couldn't add", res.message);
          setQuery('');
          await load();
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const remove = (m: TeamMember) =>
    AppAlert.alert(`Remove ${nameOf(m.user)}?`, 'They lose access to this event.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(m.userId);
          const res = await removeTeamMember(eventId!, m.userId);
          setBusy(null);
          if (!res.ok) return AppAlert.alert("Couldn't remove", res.message);
          await load();
        },
      },
    ]);

  if (!members) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
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
      <View style={styles.search}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Add someone from your space"
          placeholderTextColor={tokens.textMuted}
          selectionColor={tokens.accent}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.searchInput, { color: tokens.text }]}
        />
        {searching ? <ActivityIndicator size="small" color={tokens.accent} /> : null}
      </View>
      {query.trim().length >= 2 && !searching ? (
        <SettingsGroup>
          {results.length === 0 ? <SettingsRow label="No space members match" /> : null}
          {results.map((u) => (
            <SettingsRow
              key={u.id}
              icon={<Avatar user={u} />}
              label={nameOf(u)}
              value={onTeam.has(u.id) ? 'On the team' : undefined}
              trailing={
                onTeam.has(u.id) ? <View /> : busy === u.id ? <ActivityIndicator size="small" color={tokens.accent} /> : (
                  <Text style={[styles.link, { color: tokens.accent }]}>Add</Text>
                )
              }
              onPress={onTeam.has(u.id) || busy ? undefined : () => add(u)}
            />
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={`Team · ${members.length}`}>
        {members.length === 0 ? <SettingsRow label="Nobody assigned yet" /> : null}
        {members.map((m) => (
          <SettingsRow
            key={m.userRoleId}
            icon={<Avatar user={m.user} />}
            label={nameOf(m.user)}
            value={roleLabel(m.role?.code, m.role?.name)}
            trailing={
              busy === m.userId ? (
                <ActivityIndicator size="small" color={tokens.danger} />
              ) : (
                <Pressable onPress={() => remove(m)} hitSlop={8}>
                  <Text style={[styles.link, { color: tokens.danger }]}>Remove</Text>
                </Pressable>
              )
            }
          />
        ))}
      </SettingsGroup>
      {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}

      <View style={{ marginTop: spacing[6], gap: spacing[2] }}>
        {TEAM_ROLES.map((r) => (
          <Text key={r.code} style={[styles.note, { color: tokens.textMuted }]}>
            <Text style={{ color: tokens.textSecondary, ...font('semibold') }}>{r.label}</Text>  {r.blurb}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
