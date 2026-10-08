import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DownloadSimple, MagnifyingGlass } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton } from '../navigation/HeaderActions';
import { runImportTeams } from '../components/hackathon/importTeamsFlow';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getHackathonOverview, getTeams, type HackathonOverview, type TeamRow } from '../lib/api/hackathon';
import { joinedLabel } from '../lib/hackathon';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

type Filter = 'all' | 'active' | 'nops' | 'noroom' | 'cancelled';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'nops', label: 'No statement' },
  { value: 'noroom', label: 'No room' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Every team with its Team ID, problem statement, room and who has joined. Cancelled teams keep their ID. */
export default function HackathonTeamsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [overview, setOverview] = useState<HackathonOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useAnalyticsScreenTracking('HackathonTeams');

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

  const startImport = () => overview && runImportTeams(eventId!, overview, () => void load());

  if (!teams) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
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
                  <DownloadSimple size={24} color={tokens.text} />
                </HeaderIconButton>
              </HeaderActions>
            ) : null,
        }}
      />
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
        {teams.length === 0 ? (
          <View style={{ marginTop: spacing[10], alignItems: 'center' }}>
            <Text style={[styles.empty, { color: tokens.text }]}>No teams yet</Text>
            <Text style={[styles.note, { color: tokens.textMuted, textAlign: 'center' }]}>
              Import your confirmed group registrations. Each becomes a team with its own Team ID.
            </Text>
            <Button label="Import teams" onPress={startImport} disabled={!overview} style={{ marginTop: spacing[5] }} />
          </View>
        ) : (
          <>
            <View style={styles.search}>
              <CardBackdrop shape={styles.search} />
              <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Team ID, team or lead name"
                placeholderTextColor={tokens.textMuted}
                selectionColor={tokens.accent}
                autoCorrect={false}
                autoCapitalize="none"
                style={[styles.searchInput, { color: tokens.text }]}
              />
            </View>
            <View style={{ marginTop: spacing[4] }}>
              <ChipPicker options={FILTERS} value={filter} onChange={(v) => setFilter((v || 'all') as Filter)} />
            </View>

            <SettingsGroup title={`${shown.length} of ${teams.length}`} plain>
              {shown.length === 0 ? <SettingsRow label="No teams match" /> : null}
              {shown.map((t) => (
                <SettingsRow
                  key={t.id}
                  label={`${t.teamCode ?? '—'}  ${t.name}`}
                  value={
                    t.stage === 'CANCELLED'
                      ? undefined
                      : `${t.statement ? t.statement.code ?? 'Own PS' : 'No PS'} · ${t.room?.name ?? 'No room'} · ${joinedLabel(t.joinedCount, t.groupSize)}`
                  }
                  trailing={t.stage === 'CANCELLED' ? <Badge label="Cancelled" tone="danger" /> : undefined}
                  onPress={() => router.push(`/manage/event/${eventId}/hackathon/team/${t.id}`)}
                />
              ))}
            </SettingsGroup>
          </>
        )}
        {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  empty: { fontSize: typography.fontSize.lg, ...font('semibold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
