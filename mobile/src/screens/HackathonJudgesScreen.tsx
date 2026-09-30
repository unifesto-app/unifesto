import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChatsCircle, Coffee, Gavel, Plus, UsersFour } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getJudges, getPanels, type Judge, type Panel } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;

/** What a judge row says on the right: their queue, a break, or who they take. */
function judgeSummary(j: Judge): string {
  if (!j.isAvailable) return 'On a break';
  if (j.queue.busy || j.queue.waiting) return `${j.queue.busy ? 'In a slot' : 'Free'} · ${j.queue.waiting} waiting`;
  const bits = [j.themes.length ? j.themes.map((t) => t.name).join(', ') : 'Any theme'];
  if (!j.signedIn) bits.push('not signed in yet');
  return bits.join(' · ');
}

/** The hackathon's judges and panels, with their queues at a glance. */
export default function HackathonJudgesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [judges, setJudges] = useState<Judge[] | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('HackathonJudges');

  const load = useCallback(async () => {
    if (!eventId) return;
    const [j, p] = await Promise.all([getJudges(eventId), getPanels(eventId)]);
    if (j.ok) {
      setJudges(j.data);
      setError('');
    } else setError(j.message);
    if (p.ok) setPanels(p.data);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!judges) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const openJudge = (id: string, kind?: 'MENTOR') =>
    router.push({ pathname: `/manage/event/${eventId}/hackathon/judge`, params: { judgeId: id, ...(kind ? { kind } : {}) } });
  const onlyJudges = judges.filter((j) => j.kind !== 'MENTOR');
  const mentors = judges.filter((j) => j.kind === 'MENTOR');
  const openPanel = (id: string) => router.push({ pathname: `/manage/event/${eventId}/hackathon/panel`, params: { panelId: id } });

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
      <SettingsGroup title={`Judges · ${onlyJudges.length}`}>
        {onlyJudges.length === 0 ? <SettingsRow label="No judges yet" /> : null}
        {onlyJudges.map((j) => (
          <SettingsRow
            key={j.id}
            icon={j.isAvailable ? <Gavel size={ICON} color={tokens.accent} weight="fill" /> : <Coffee size={ICON} color={tokens.textMuted} weight="fill" />}
            label={j.name || j.contact || 'Judge'}
            value={judgeSummary(j)}
            onPress={() => openJudge(j.id)}
          />
        ))}
        <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="Add a judge" onPress={() => openJudge('new')} />
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Add judges by phone number or email. They sign in to Unifesto as usual and find the judge console under Judging.
        They see team names, problem statements and project links, never contact details.
      </Text>

      <SettingsGroup title={`Mentors · ${mentors.length}`}>
        {mentors.map((j) => (
          <SettingsRow
            key={j.id}
            icon={j.isAvailable ? <ChatsCircle size={ICON} color={tokens.accent} weight="fill" /> : <Coffee size={ICON} color={tokens.textMuted} weight="fill" />}
            label={j.name || j.contact || 'Mentor'}
            value={judgeSummary(j)}
            onPress={() => openJudge(j.id)}
          />
        ))}
        <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="Add a mentor" onPress={() => openJudge('new', 'MENTOR')} />
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Mentors take mentoring rounds: teams book a session and get written feedback. Mentors never give marks.
      </Text>

      <SettingsGroup title="Panels">
        {panels.map((p) => (
          <SettingsRow
            key={p.id}
            icon={<UsersFour size={ICON} color={p.isAvailable ? tokens.accent : tokens.textMuted} weight="fill" />}
            label={p.name}
            value={`${p.members.length} judge${p.members.length === 1 ? '' : 's'}${p.round ? ` · ${p.round.name}` : ''}${p.queue.waiting ? ` · ${p.queue.waiting} waiting` : ''}`}
            onPress={() => openPanel(p.id)}
          />
        ))}
        <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="Add a panel" onPress={() => openPanel('new')} />
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Panels are for rounds judged by a panel: the judges sit together, each team gets one slot, and every judge on the panel gives marks.
      </Text>

      <Button
        label="Live queues"
        variant="secondary"
        size="lg"
        fullWidth
        onPress={() => router.push(`/manage/event/${eventId}/hackathon/queues`)}
        style={{ marginTop: spacing[6] }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
