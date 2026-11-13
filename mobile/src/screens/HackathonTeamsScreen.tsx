import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DownloadSimple } from '../components/ui/icons';
import CosmosScreen, { CosmosList } from '../components/ui/CosmosScreen';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui';
import ChipPicker from '../components/manage/ChipPicker';
import SearchField from '../components/manage/SearchField';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup, SettingsGroupHeader, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton } from '../navigation/HeaderActions';
import { runImportTeams } from '../components/hackathon/importTeamsFlow';
import { getHackathonOverview, getTeams, type HackathonOverview, type TeamRow } from '../lib/api/hackathon';
import { joinedLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

type Filter = 'all' | 'active' | 'nops' | 'noroom' | 'cancelled';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'nops', label: 'No statement' },
  { value: 'noroom', label: 'No room' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Every team with its Team ID, problem statement, room and who has joined, as rows
 * on the page with full hairlines. Cancelled teams keep their ID.
 */
export default function HackathonTeamsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [overview, setOverview] = useState<HackathonOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!eventId) return;
    const [t, o] = await Promise.all([getTeams(eventId), getHackathonOverview(eventId)]);
    if (t.ok) {
      setTeams(t.data);
      setError('');
    } else {
      setError(t.message);
      setTeams((x) => x ?? []);
    }
    if (o.ok) setOverview(o.data);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (teams ?? []).filter((t) => {
      if (filter === 'active' && t.stage === 'CANCELLED') return false;
      if (filter === 'cancelled' && t.stage !== 'CANCELLED') return false;
      if (filter === 'noroom' && (t.room || t.stage === 'CANCELLED')) return false;
      if (filter === 'nops' && t.stage !== 'NEEDS_PS') return false;
      if (!q) return true;
      return [t.teamCode, t.name, t.leadName, t.statement?.code, t.statement?.title].some((s) => s?.toLowerCase().includes(q));
    });
  }, [teams, query, filter]);

  const openTeam = useCallback((id: string) => router.push(`/manage/event/${eventId}/hackathon/team/${id}`), [router, eventId]);

  const startImport = () => overview && runImportTeams(eventId!, overview, () => void load());

  if (!teams) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            overview ? (
              <HeaderActions>
                <HeaderIconButton onPress={startImport} label="Import teams">
                  <DownloadSimple size={24} color={c.text} />
                </HeaderIconButton>
              </HeaderActions>
            ) : null,
        }}
      />
      <CosmosList
        contentContainerStyle={styles.content}
        bottom={100}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        data={shown}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          teams.length === 0 ? null : (
            <>
              <SearchField value={query} onChangeText={setQuery} placeholder="Team ID, team or lead name" />
              <View style={{ marginTop: spacing[4] }}>
                <ChipPicker options={FILTERS} value={filter} onChange={(v) => setFilter((v || 'all') as Filter)} />
              </View>

              <SettingsGroupHeader title={`${shown.length} of ${teams.length}`} />
            </>
          )
        }
        ListEmptyComponent={
          teams.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={[styles.empty, { color: c.text }]} accessibilityRole="header">
                No teams yet
              </Text>
              <Text style={[styles.note, { color: c.muted, textAlign: 'center' }]}>
                Import your confirmed group registrations. Each becomes a team with its own Team ID.
              </Text>
              <Button label="Import teams" onPress={startImport} disabled={!overview} style={{ marginTop: spacing[5] }} />
            </View>
          ) : (
            <SettingsGroup flat plain style={styles.cell}>
              <SettingsRow label="No teams match" />
            </SettingsGroup>
          )
        }
        renderItem={({ item, index }) => (
          // A one-row flat group gives the row its on-page padding; the hairline sits between rows.
          <View style={index > 0 && [styles.divider, { borderTopColor: c.border }]}>
            <SettingsGroup flat plain style={styles.cell}>
              <TeamItem t={item} onOpen={openTeam} />
            </SettingsGroup>
          </View>
        )}
        ListFooterComponent={error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}
      />
    </>
  );
}

const TeamItem = React.memo(function TeamItem({ t, onOpen }: { t: TeamRow; onOpen: (id: string) => void }) {
  return (
    <SettingsRow
      label={`${t.teamCode ?? '–'}  ${t.name}`}
      value={
        t.stage === 'CANCELLED'
          ? undefined
          : `${t.statement ? t.statement.code ?? 'Own PS' : 'No PS'} · ${t.room?.name ?? 'No room'} · ${joinedLabel(t.joinedCount, t.groupSize)}`
      }
      trailing={t.stage === 'CANCELLED' ? <Badge label="Cancelled" tone="danger" /> : undefined}
      onPress={() => onOpen(t.id)}
    />
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  // An empty state on the page: headline, one line, one button.
  emptyCard: { alignItems: 'center', marginTop: spacing[10] },
  empty: { fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  cell: { marginTop: 0 },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
