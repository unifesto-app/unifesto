import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { User } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import {
  addTeamMember,
  getEventTeam,
  removeTeamMember,
  roleLabel,
  searchTeamCandidates,
  TEAM_RANK,
  TEAM_ROLES,
  type TeamMember,
  type TeamUser,
} from '../lib/api/eventTeam';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SearchField from '../components/manage/SearchField';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const AVATAR = 30;

function Avatar({ user }: { user: TeamUser }) {
  const c = useCosmos();
  return user.avatarUrl ? (
    <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
  ) : (
    <User size={AVATAR - 2} color={c.primary} weight="fill" />
  );
}

/**
 * Who runs this event. Search members of the space, pick a role, and remove
 * people. Changing someone's role is remove + add again with the new one.
 */
export default function EventTeamScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamUser[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  const { user } = useAuth();
  const { spaces } = useSpaceAccess();
  const [spaceId, setSpaceId] = useState<string | null>(null);

  // My rank here: Space Admin of the owning space, else my own event role.
  const myRank = Math.max(
    0,
    ...spaces.flatMap((s) => [
      s.id === spaceId ? TEAM_RANK[s.userRole?.code ?? ''] ?? 0 : 0,
      TEAM_RANK[s.eventAccess.find((e) => e.eventId === eventId)?.roleCode ?? ''] ?? 0,
    ]),
  );
  const roleOptions = TEAM_ROLES.filter((r) => TEAM_RANK[r.code] < myRank);
  const canEdit = (m: TeamMember) => m.userId !== user?.id && (TEAM_RANK[m.role?.code ?? ''] ?? 0) < myRank;

  useEffect(() => {
    if (eventId) void getManagedEvent(eventId).then((res) => res.ok && setSpaceId(res.data.spaceId));
  }, [eventId]);

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
      ...roleOptions.map((r) => ({
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
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {roleOptions.length > 0 ? (
        <SearchField value={query} onChangeText={setQuery} busy={searching} placeholder="Add someone from your space" />
      ) : null}
      {roleOptions.length > 0 && query.trim().length >= 2 && !searching ? (
        <SettingsGroup>
          {results.length === 0 ? <SettingsRow label="No space members match" /> : null}
          {results.map((u) => (
            <SettingsRow
              key={u.id}
              icon={<Avatar user={u} />}
              label={nameOf(u)}
              value={onTeam.has(u.id) ? 'On the team' : undefined}
              trailing={
                onTeam.has(u.id) ? <View /> : busy === u.id ? <ActivityIndicator size="small" color={c.text} /> : (
                  <Text style={[styles.link, { color: c.primary }]}>Add</Text>
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
                <ActivityIndicator size="small" color={c.danger} />
              ) : !canEdit(m) ? undefined : (
                <Pressable onPress={() => remove(m)} hitSlop={8}>
                  <Text style={[styles.link, { color: c.danger }]}>Remove</Text>
                </Pressable>
              )
            }
          />
        ))}
      </SettingsGroup>
      {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}

      <View style={{ marginTop: spacing[6], gap: spacing[2] }}>
        {TEAM_ROLES.map((r) => (
          <Text key={r.code} style={[styles.note, { color: c.muted }]}>
            <Text style={{ color: c.soft, ...cosmosFont.strong }}>{r.label}</Text>  {r.blurb}
          </Text>
        ))}
      </View>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  link: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
