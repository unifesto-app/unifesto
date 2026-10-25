import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, BellRinging, DoorOpen, Gavel, Lifebuoy, Lightbulb, LinkSimple, LockSimple, MapPin, Trophy, UsersThree, WarningCircle } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import QuickTiles, { type QuickTile } from '../components/profile/QuickTiles';
import { HeaderActions, HeaderIconButton } from '../navigation/HeaderActions';
import { getMyHackathon, type HackathonHub } from '../lib/api/hackathon';
import { evalStatusLabel, stageCopy, venueMapsUrl } from '../lib/hackathon';
import { isEventOver } from '../lib/eventEnded';
import { AfterEventGroup, useEventCertificate } from '../components/EventEnded';
import { onNotificationArrived } from '../lib/notificationBus';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

/**
 * A team member's home for the hackathon: their Team ID, what's next, their
 * room and the venue, the team, and updates from the organisers. Refreshes on
 * focus and whenever a hackathon notification arrives. No marks, ever.
 */
export default function HackathonHubScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [hub, setHub] = useState<HackathonHub | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getMyHackathon(eventId);
    if (res.ok) {
      setHub(res.data);
      setError('');
    } else {
      setError(res.message);
      setHub((h) => (h === undefined ? null : h));
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(
    () =>
      onNotificationArrived((n) => {
        if (!n.eventId || n.eventId === eventId) void load();
      }),
    [eventId, load],
  );

  // Once the sprint is over the hub is about results, not what's next (G11).
  const ended = !!hub?.team && hub.team.stage !== 'CANCELLED' && isEventOver(hub.event);
  const cert = useEventCertificate(eventId, ended);

  const unread = hub?.unreadCount ?? 0;
  const header = (
    <Stack.Screen
      options={{
        title: 'Hackathon',
        headerRight: hub
          ? () => (
              <HeaderActions>
                <HeaderIconButton onPress={() => router.push(`/hackathon/${eventId}/updates`)} label={unread ? `${unread} new updates` : 'Updates'}>
                  {unread ? <BellRinging size={24} color={c.primary} weight="fill" /> : <Bell size={24} color={c.text} />}
                </HeaderIconButton>
              </HeaderActions>
            )
          : undefined,
      }}
    />
  );

  if (hub === undefined) {
    return (
      <>
        {header}
        <CosmosScreen>
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        </CosmosScreen>
      </>
    );
  }

  if (!hub || !hub.team) {
    return (
      <>
        {header}
        <CosmosScreen contentContainerStyle={styles.content}>
          <View style={[styles.empty, { backgroundColor: c.raised }]}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              {!hub ? 'No hackathon here right now' : 'You’re not on a hackathon team'}
            </Text>
            <Text style={[styles.body, { color: c.soft, textAlign: 'center' }]}>
              {error ||
                (!hub
                  ? 'This event isn’t running its hackathon in the app at the moment.'
                  : 'Teams are made from group registrations. If someone invited you to their group, claim your seat from the invite, then come back here.')}
            </Text>
            <Button label="Refresh" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[5] }} />
          </View>
        </CosmosScreen>
      </>
    );
  }

  const team = hub.team;
  const stage = ended
    ? { title: 'This sprint has ended', body: 'Thanks for taking part. Results and winners are below.' }
    : stageCopy(team.stage, team.statementBlock, hub.problemStatements.deadline);
  const cancelled = team.stage === 'CANCELLED';
  const maps = venueMapsUrl(hub.venue);
  const venueLines = [hub.venue.name, hub.venue.address].filter(Boolean) as string[];
  const joined = team.members.filter((m) => m.joined).length;
  const request = team.evaluation?.request ?? null;
  const icon = (I: typeof MapPin) => <I size={ICON} color={c.primary} weight="fill" />;
  const go = (path: string) => () => router.push(`/hackathon/${eventId}/${path}`);

  // The one thing the team should do right now, if any, lives on the pass.
  const cta = ended
    ? null
    : request?.status === 'CALLED'
      ? { label: 'You’re up! Go to judging', onPress: go('evaluate') }
      : team.stage === 'NEEDS_PS' && team.statementBlock === null && team.isLead
        ? { label: 'Choose problem statement', onPress: go('statement') }
        : null;

  const tiles: QuickTile[] = [
    { key: 'team', label: `${joined}/${team.members.length} joined`, icon: icon(UsersThree), onPress: go('team') },
    { key: 'updates', label: unread ? `${unread} new` : 'Updates', icon: icon(unread ? BellRinging : Bell), onPress: go('updates') },
    ...(!cancelled && !ended ? [{ key: 'help', label: 'Get help', icon: icon(Lifebuoy), onPress: go('help') }] : []),
  ];

  return (
    <>
      {header}
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
        {/* Team pass: who you are, then what's next */}
        <View style={styles.pass}>
          <CardBackdrop shape={styles.pass} />
          <View style={styles.passTop}>
            <Text style={[styles.label, { color: c.muted }]} numberOfLines={1}>
              {hub.event.title}
            </Text>
            <Text
              style={[styles.teamCode, { color: cancelled ? c.muted : c.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLabel={`Team ID ${team.teamCode ?? 'not assigned'}`}
            >
              {team.teamCode ?? '—'}
            </Text>
            <Text style={[styles.teamName, { color: c.soft }]} numberOfLines={2}>
              {team.name}
              {team.isLead ? ' · Lead' : ''}
            </Text>
          </View>
          <View style={[styles.passDivider, { backgroundColor: c.bg }]} />
          <View style={styles.passBottom}>
            <View style={styles.stageRow}>
              {cancelled ? <WarningCircle size={22} color={c.danger} weight="fill" /> : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.stageTitle, { color: cancelled ? c.danger : c.text }]}>{stage.title}</Text>
                <Text style={[styles.stageBody, { color: c.soft }]}>{stage.body}</Text>
              </View>
            </View>
            {cta ? <Button label={cta.label} onPress={cta.onPress} style={{ marginTop: spacing[4] }} /> : null}
          </View>
        </View>

        <View style={{ marginTop: spacing[4] }}>
          <QuickTiles tiles={tiles} />
        </View>

        {!cancelled && (!ended || team.statement) ? (
          <SettingsGroup title="Problem statement">
            <SettingsRow
              icon={team.statement?.lockedAt ? icon(LockSimple) : icon(Lightbulb)}
              label={
                team.statement
                  ? [team.statement.code, team.statement.title].filter(Boolean).join(' · ')
                  : team.statementBlock === null
                    ? team.isLead
                      ? 'Choose your problem statement'
                      : 'See the options'
                    : team.statementBlock === 'NOT_OPEN'
                      ? 'Not open yet'
                      : 'The organisers will assign it'
              }
              value={team.statement?.themeLabel ?? (team.statementBlock === null ? 'Open' : undefined)}
              onPress={go('statement')}
            />
          </SettingsGroup>
        ) : null}

        {ended ? <AfterEventGroup cert={cert} results={{ onPress: go('results') }} /> : null}

        {team.evaluation && !ended ? (
          <SettingsGroup title="Judging">
            <SettingsRow
              icon={icon(Gavel)}
              label={
                request
                  ? request.status === 'CALLED'
                    ? 'You’re up!'
                    : request.status === 'WAITING'
                      ? `Number ${request.position ?? '…'} for ${request.evaluatorName ?? 'your judge'}`
                      : `${evalStatusLabel(request.status)} · ${request.evaluatorName ?? ''}`
                  : 'Evaluation'
              }
              value={request ? request.roundName : team.evaluation.openRounds ? 'Round open' : 'Not open yet'}
              onPress={go('evaluate')}
            />
            <SettingsRow icon={icon(LinkSimple)} label="Project links" onPress={go('submission')} />
            <SettingsRow icon={icon(Trophy)} label="Results and winners" onPress={go('results')} />
          </SettingsGroup>
        ) : null}

        {!ended && (!cancelled || venueLines.length) ? (
          <SettingsGroup title="Where to be">
            {!cancelled ? (
              <SettingsRow
                icon={icon(DoorOpen)}
                label={team.room?.name ?? 'Room not assigned yet'}
                value={team.room ? team.room.location ?? undefined : 'We’ll notify you'}
              />
            ) : null}
            {venueLines.length ? (
              <SettingsRow
                icon={icon(MapPin)}
                label={venueLines[0]}
                value={maps ? 'Directions' : undefined}
                external={!!maps}
                onPress={maps ? () => void Linking.openURL(maps) : undefined}
              />
            ) : null}
          </SettingsGroup>
        ) : null}
        {(ended ? [] : [!cancelled ? team.room?.notes : null, venueLines[1], hub.venue.notes]).filter(Boolean).map((n, i) => (
          <Text key={i} style={[styles.note, { color: c.soft }]}>
            {n}
          </Text>
        ))}
      </CosmosScreen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  emptyTitle: { fontSize: typography.fontSize.lg, textAlign: 'center', ...cosmosFont.strong },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...cosmosFont.body },
  pass: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  passTop: { paddingHorizontal: spacing[5], paddingTop: spacing[6], paddingBottom: spacing[5], alignItems: 'center' },
  passDivider: { height: 2 },
  passBottom: { padding: spacing[5] },
  label: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  teamCode: { marginTop: spacing[2], fontSize: typography.fontSize['5xl'], ...cosmosFont.figure },
  teamName: { marginTop: spacing[1], fontSize: typography.fontSize.lg, textAlign: 'center', ...cosmosFont.strong },
  stageRow: { flexDirection: 'row', gap: spacing[3] },
  stageTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  stageBody: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
