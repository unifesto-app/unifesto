import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Megaphone, Plus, Trophy } from '@unifesto/unicon/react-native';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import ShadeCard from '../components/ui/ShadeCard';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { openSpaceWeb } from '../lib/openOnWeb';
import { getAwards, publishAwards, type AwardsList } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

/**
 * Winners (plan §2 #20): awards the curator declares for any team, whatever
 * its rank, each with notes, then publishes. Winners hear "You won", everyone
 * else "Winners announced". Co-Curators see the list read-only.
 */
export default function HackathonWinnersScreen() {
  const { eventId, spaceId } = useLocalSearchParams<{ eventId: string; spaceId?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [data, setData] = useState<AwardsList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getAwards(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!data) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const unpublished = data.awards.filter((a) => !a.published);
  // The first award is the screen's hero; the rest stay a list.
  const [top, ...rest] = data.awards;
  const awardStatus = (a: AwardsList['awards'][number]) =>
    a.team.cancelled ? 'Team cancelled' : a.published ? 'Published' : 'Not published';
  // Writing awards is desk work on Unifesto Space (D3); publishing them stays here.
  const openAwards = () => openSpaceWeb(`/events/${eventId}/hackathon/winners`, spaceId);

  const publish = () =>
    AppAlert.alert(
      `Publish ${unpublished.length} award${unpublished.length === 1 ? '' : 's'}?`,
      `${unpublished.map((a) => `${a.title}: ${a.team.teamCode ?? a.team.name}`).join('\n')}\n\nWinning teams hear “You won”, every other team and all judges hear the winners are out.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setBusy(true);
            // Only the awards shown in the confirm, not any another curator added since.
            const res = await publishAwards(eventId!, unpublished.map((a) => a.id));
            setBusy(false);
            if (!res.ok) return AppAlert.alert("Couldn't publish", res.message);
            setData(res.data);
          },
        },
      ],
    );

  return (
    <CosmosScreen
      contentContainerStyle={styles.content}
      bottom={100}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {top ? (
        <ShadeCard
          tone="blue"
          onPress={data.canDeclareWinners ? openAwards : undefined}
          accessibilityLabel={`${top.title}: ${top.team.name}. ${awardStatus(top)}`}
        >
          <View style={styles.heroTop}>
            <Trophy size={22} color={c.text} weight="fill" />
            <Text style={[styles.heroAward, { color: c.soft }]} numberOfLines={1}>
              {top.title}
            </Text>
          </View>
          <Text style={[styles.heroTeam, { color: c.text }]} numberOfLines={2}>
            {top.team.name}
          </Text>
          <Text style={[styles.heroMeta, { color: c.soft }]}>
            {top.team.teamCode ? <Text style={cosmosFont.figure}>{`${top.team.teamCode} · `}</Text> : null}
            <Text style={{ color: top.published && !top.team.cancelled ? c.text : c.soft }}>{awardStatus(top)}</Text>
          </Text>
        </ShadeCard>
      ) : null}

      <SettingsGroup title={top ? 'More awards' : 'Awards'}>
        {data.awards.length === 0 ? <SettingsRow label="No awards yet" /> : null}
        {rest.map((a) => (
          <SettingsRow
            key={a.id}
            icon={<Trophy size={ICON} color={a.published ? c.ivory : c.muted} weight="fill" />}
            label={`${a.title} · ${a.team.teamCode ?? ''} ${a.team.name}`.trim()}
            value={awardStatus(a)}
            external={data.canDeclareWinners}
            onPress={data.canDeclareWinners ? openAwards : undefined}
          />
        ))}
        {data.canDeclareWinners ? (
          <SettingsRow icon={<Plus size={ICON} color={c.text} />} label="Add an award" external onPress={openAwards} />
        ) : null}
      </SettingsGroup>
      <Text style={[styles.note, { color: c.muted }]}>
        {data.canDeclareWinners
          ? 'Pick any team, whatever its rank, and say why it won. Teams see awards and notes once you publish.'
          : 'Only the Curator or a Space Admin can declare and publish winners.'}
      </Text>

      {data.canDeclareWinners && unpublished.length ? (
        <Button
          label={`Publish ${unpublished.length} award${unpublished.length === 1 ? '' : 's'}`}
          size="lg"
          fullWidth
          loading={busy}
          icon={<Megaphone size={18} color={c.primaryFg} weight="fill" />}
          onPress={publish}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}

      <Button
        label="See results"
        variant="secondary"
        fullWidth
        onPress={() => router.push(`/manage/event/${eventId}/hackathon/results`)}
        style={{ marginTop: spacing[3] }}
      />
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  heroAward: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  heroTeam: { marginTop: spacing[4], fontSize: typography.fontSize['2xl'], lineHeight: 28, ...cosmosFont.strong },
  heroMeta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
