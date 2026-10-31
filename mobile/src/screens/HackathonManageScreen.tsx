import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Lifebuoy, Tray, Broadcast, Buildings, Certificate, ChartBar, DoorOpen, DownloadSimple, Gavel, GearSix, Lightbulb, ListNumbers, MapPin, Megaphone, Power, Tag, Trophy, UsersThree } from '@unifesto/unicon/react-native';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER } from '../components/home/Section';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { openSpaceWeb } from '../lib/openOnWeb';
import { runImportTeams } from '../components/hackathon/importTeamsFlow';
import {
  disableHackathon,
  enableHackathon,
  getHackathonOverview,
  type HackathonOverview,
} from '../lib/api/hackathon';
import { psModeSummary } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

const ICON = 28;

const WHAT_IT_DOES = [
  'Group registrations become teams, each with a Team ID in your format.',
  'Every team member gets the hackathon screens: Team ID, venue, room and updates.',
  'Teams lock in a problem statement (written, picked from your list, or assigned by you) before judging.',
  'Teams pick a judge and wait in a live queue; judges call them, run a timed slot and give marks.',
  'Updates reach teams as a push and in the app.',
];

/**
 * The curator's hackathon hub for one event: switch hackathon mode on or off,
 * see teams and rooms at a glance, and get to teams, rooms and settings.
 */
export default function HackathonManageScreen() {
  const { eventId, spaceId } = useLocalSearchParams<{ eventId: string; spaceId?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [data, setData] = useState<HackathonOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Hackathon setup is desk work, so it opens on Unifesto Space (D3).
  const web = (path: string) => () => openSpaceWeb(`/events/${eventId}/hackathon${path}`, spaceId);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getHackathonOverview(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else {
      setError(res.denied ? "You can't manage this event's hackathon." : res.message);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const turnOn = async () => {
    setSwitching(true);
    const res = await enableHackathon(eventId!);
    setSwitching(false);
    if (!res.ok) return AppAlert.alert("Couldn't turn it on", res.message);
    setData(res.data);
    if (!res.data.hackathon?.teamCodePrefix) {
      AppAlert.alert('Hackathon mode is on', 'Next, set your Team ID format in settings, then import teams.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open settings', onPress: web('/settings') },
      ]);
    }
  };

  const turnOff = () =>
    AppAlert.alert(
      'Turn off hackathon mode?',
      'Teams and judges stop seeing the hackathon screens. Teams, Team IDs and rooms are kept, and turning it back on restores everything.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: async () => {
            setSwitching(true);
            const res = await disableHackathon(eventId!);
            setSwitching(false);
            if (!res.ok) return AppAlert.alert("Couldn't turn it off", res.message);
            setData(res.data);
          },
        },
      ],
    );

  if (!data) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.note, { color: c.soft, textAlign: 'center' }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const h = data.hackathon;
  const on = !!h?.enabled;
  const icon = (I: typeof Power) => <I size={ICON} color={c.text} />;
  const venueName = h?.venue.name || data.eventVenue.name || data.eventVenue.address;

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
      {!on ? (
        <View>
          <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
            {h ? 'Hackathon mode is off' : 'Run this event as a hackathon'}
          </Text>
          <Text style={[styles.body, { color: c.soft }]}>
            {h
              ? 'Teams and judges can’t see the hackathon right now. Everything you set up is saved.'
              : 'Turn on hackathon mode to manage teams, rooms and judging from here.'}
          </Text>
          {!h ? (
            <View style={{ marginTop: spacing[4], gap: spacing[2] }}>
              {WHAT_IT_DOES.map((line) => (
                <Text key={line} style={[styles.note, { color: c.muted }]}>
                  •  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {!data.planAllowed ? (
            <Text style={[styles.note, { color: c.warn, marginTop: spacing[5] }]}>
              Hackathon mode isn’t included in this space’s plan. Ask a space admin to upgrade.
            </Text>
          ) : data.otherBoard && data.otherBoard.entrants > 0 ? (
            <Text style={[styles.note, { color: c.warn, marginTop: spacing[5] }]}>
              This event already has a leaderboard with entrants, so it can’t be switched to a hackathon.
            </Text>
          ) : null}
          <Button
            label={h ? 'Turn back on' : 'Turn on hackathon mode'}
            size="lg"
            fullWidth
            loading={switching}
            disabled={!data.planAllowed || (!!data.otherBoard && data.otherBoard.entrants > 0)}
            onPress={() => void turnOn()}
            style={{ marginTop: spacing[6] }}
          />
        </View>
      ) : (
        <>
          <ManageStats
            stats={[
              { label: 'Teams', value: data.counts.active, tone: 'sky' },
              { label: 'PS locked', value: data.counts.psLocked },
              { label: 'No room', value: data.counts.unallocated },
              { label: 'Cancelled', value: data.counts.cancelled },
            ]}
          />

          {!h?.teamCodePrefix ? (
            <SettingsGroup title="Start here">
              <SettingsRow
                icon={icon(GearSix)}
                label="Set your Team ID format"
                value="Needed to import"
                external
                onPress={web('/settings')}
              />
            </SettingsGroup>
          ) : null}

          <SettingsGroup title="Teams">
            <SettingsRow
              icon={icon(UsersThree)}
              label="Teams"
              value={data.counts.teams ? `${data.counts.active} active` : 'None yet'}
              onPress={() => router.push(`/manage/event/${eventId}/hackathon/teams`)}
            />
            <SettingsRow
              icon={icon(DownloadSimple)}
              label="Import group registrations"
              value={h?.nextTeamCode ? `Next ${h.nextTeamCode}` : undefined}
              onPress={() => runImportTeams(eventId!, data, () => void load())}
            />
            <SettingsRow
              icon={icon(Lightbulb)}
              label="Problem statements"
              value={
                data.counts.statements
                  ? `${data.counts.statements} · ${psModeSummary(h?.psMode ?? null, h?.psDeadline ?? null)}`
                  : psModeSummary(h?.psMode ?? null, h?.psDeadline ?? null)
              }
              external
              onPress={web('/statements')}
            />
            <SettingsRow
              icon={icon(Tag)}
              label="Themes"
              value={data.counts.themes ? String(data.counts.themes) : h?.themeMode === 'TEXT' ? 'Teams type it' : 'Add themes'}
              external
              onPress={web('/themes')}
            />
          </SettingsGroup>
          {data.counts.active ? (
            <Text style={[styles.note, { color: c.muted, marginTop: spacing[2] }]}>
              {data.counts.psLocked} of {data.counts.active} teams have locked in a problem statement. Only those teams can be judged.
            </Text>
          ) : null}

          <SettingsGroup title="Judging">
            <SettingsRow
              icon={icon(ListNumbers)}
              label="Rounds and criteria"
              onPress={() => router.push({ pathname: `/manage/event/${eventId}/hackathon/rounds`, params: { spaceId } })}
            />
            <SettingsRow
              icon={icon(Gavel)}
              label="Judges, mentors and panels"
              external
              onPress={web('/judges')}
            />
            <SettingsRow
              icon={icon(Broadcast)}
              label="Live queues"
              onPress={() => router.push(`/manage/event/${eventId}/hackathon/queues`)}
            />
          </SettingsGroup>

          <SettingsGroup title="Announcements and help">
            <SettingsRow
              icon={icon(Megaphone)}
              label="Send an announcement"
              onPress={() => router.push(`/manage/event/${eventId}/hackathon/announce`)}
            />
            <SettingsRow
              icon={icon(Lifebuoy)}
              label="Help topics and contacts"
              value="Food, Wi-Fi…"
              onPress={() => router.push(`/manage/event/${eventId}/hackathon/help-topics`)}
            />
            <SettingsRow icon={icon(Tray)} label="Queries from teams" onPress={() => router.push(`/hackathon/${eventId}/help-desk`)} />
          </SettingsGroup>

          <SettingsGroup title="Results and winners">
            <SettingsRow
              icon={icon(ChartBar)}
              label="Results"
              value={h?.scoringMode === 'CUMULATIVE' ? 'Rounds added up' : 'Final round decides'}
              onPress={() => router.push(`/manage/event/${eventId}/hackathon/results`)}
            />
            <SettingsRow
              icon={icon(Trophy)}
              label="Winners"
              value={
                data.counts.awards
                  ? `${data.counts.awardsPublished} of ${data.counts.awards} published`
                  : data.canDeclareWinners
                    ? 'Add awards'
                    : 'None yet'
              }
              onPress={() => router.push({ pathname: `/manage/event/${eventId}/hackathon/winners`, params: { spaceId } })}
            />
            <SettingsRow
              icon={icon(Certificate)}
              label="Certificates"
              value="Participants and winners"
              external
              onPress={web('/certificates')}
            />
          </SettingsGroup>

          <SettingsGroup title="Venue and setup">
            <SettingsRow
              icon={icon(DoorOpen)}
              label="Rooms"
              value={data.counts.rooms ? `${data.counts.rooms} · ${data.counts.unallocated} teams without one` : 'Add rooms'}
              onPress={() => router.push(`/manage/event/${eventId}/hackathon/rooms`)}
            />
            <SettingsRow
              icon={icon(h?.venue.name ? Buildings : MapPin)}
              label="Venue"
              value={venueName || 'Not set'}
              external
              onPress={web('/settings')}
            />
            <SettingsRow
              icon={icon(GearSix)}
              label="Hackathon settings"
              value={h?.nextTeamCode ?? undefined}
              external
              onPress={web('/settings')}
            />
          </SettingsGroup>

          <SettingsGroup>
            <SettingsRow
              icon={<Power size={ICON} color={c.danger} weight="fill" />}
              label="Turn off hackathon mode"
              danger
              trailing={switching ? <ActivityIndicator size="small" color={c.danger} /> : undefined}
              onPress={switching ? undefined : turnOff}
            />
          </SettingsGroup>
        </>
      )}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  title: { fontSize: 26, lineHeight: 32, ...cosmosFont.display, letterSpacing: displayTracking(26) },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...cosmosFont.body },
  note: { marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
