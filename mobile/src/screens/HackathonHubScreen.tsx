import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, BellRinging, DoorOpen, MapPin, UsersThree, WarningCircle } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton } from '../navigation/HeaderActions';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getMyHackathon, type HackathonHub } from '../lib/api/hackathon';
import { stageCopy, venueMapsUrl } from '../lib/hackathon';
import { onNotificationArrived } from '../lib/notificationBus';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;

/**
 * A team member's home for the hackathon: their Team ID, what's next, their
 * room and the venue, the team, and updates from the organisers. Refreshes on
 * focus and whenever a hackathon notification arrives. No marks, ever.
 */
export default function HackathonHubScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [hub, setHub] = useState<HackathonHub | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('HackathonHub');

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

  const unread = hub?.unreadCount ?? 0;
  const header = (
    <Stack.Screen
      options={{
        title: 'Hackathon',
        headerRight: hub
          ? () => (
              <HeaderActions>
                <HeaderIconButton onPress={() => router.push(`/hackathon/${eventId}/updates`)} label={unread ? `${unread} new updates` : 'Updates'}>
                  {unread ? <BellRinging size={24} color={tokens.accent} weight="fill" /> : <Bell size={24} color={tokens.text} />}
                </HeaderIconButton>
              </HeaderActions>
            )
          : undefined,
      }}
    />
  );

  if (hub === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {header}
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (!hub || !hub.team) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {header}
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>
          {!hub ? 'No hackathon here right now' : 'You’re not on a hackathon team'}
        </Text>
        <Text style={[styles.body, { color: tokens.textSecondary, textAlign: 'center' }]}>
          {error ||
            (!hub
              ? 'This event isn’t running its hackathon in the app at the moment.'
              : 'Teams are made from group registrations. If someone invited you to their group, claim your seat from the invite, then come back here.')}
        </Text>
        <Button label="Refresh" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[5] }} />
      </View>
    );
  }

  const team = hub.team;
  const stage = stageCopy(team.stage);
  const cancelled = team.stage === 'CANCELLED';
  const maps = venueMapsUrl(hub.venue);
  const venueLines = [hub.venue.name, hub.venue.address].filter(Boolean) as string[];
  const joined = team.members.filter((m) => m.joined).length;
  const icon = (I: typeof MapPin) => <I size={ICON} color={tokens.accent} weight="fill" />;

  return (
    <>
      {header}
      <ScrollView
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
        {/* Team ID card */}
        <View style={styles.idCard}>
          <CardBackdrop shape={styles.idCard} />
          <Text style={[styles.label, { color: tokens.textMuted }]}>{hub.event.title}</Text>
          <Text
            style={[styles.teamCode, { color: cancelled ? tokens.textMuted : tokens.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Team ID ${team.teamCode ?? 'not assigned'}`}
          >
            {team.teamCode ?? '—'}
          </Text>
          <Text style={[styles.teamName, { color: tokens.textSecondary }]} numberOfLines={2}>
            {team.name}
          </Text>
        </View>

        {/* What's next */}
        <View style={[styles.stage, { borderColor: cancelled ? tokens.danger : tokens.borderStrong }]}>
          {cancelled ? <WarningCircle size={22} color={tokens.danger} weight="fill" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.stageTitle, { color: cancelled ? tokens.danger : tokens.text }]}>{stage.title}</Text>
            <Text style={[styles.stageBody, { color: tokens.textSecondary }]}>{stage.body}</Text>
          </View>
        </View>

        {!cancelled ? (
          <SettingsGroup title="Your room">
            {team.room ? (
              <SettingsRow icon={icon(DoorOpen)} label={team.room.name} value={team.room.location ?? undefined} />
            ) : (
              <SettingsRow icon={icon(DoorOpen)} label="Not assigned yet" value="We’ll notify you" />
            )}
          </SettingsGroup>
        ) : null}
        {!cancelled && team.room?.notes ? (
          <Text style={[styles.note, { color: tokens.textSecondary }]}>{team.room.notes}</Text>
        ) : null}

        {venueLines.length || hub.venue.notes ? (
          <>
            <SettingsGroup title="Venue">
              <SettingsRow
                icon={icon(MapPin)}
                label={venueLines[0] ?? 'Venue'}
                value={maps ? 'Directions' : undefined}
                external={!!maps}
                onPress={maps ? () => void Linking.openURL(maps) : undefined}
              />
            </SettingsGroup>
            {venueLines[1] ? <Text style={[styles.note, { color: tokens.textSecondary }]}>{venueLines[1]}</Text> : null}
            {hub.venue.notes ? <Text style={[styles.note, { color: tokens.textSecondary }]}>{hub.venue.notes}</Text> : null}
          </>
        ) : null}

        <SettingsGroup title="Team">
          <SettingsRow
            icon={icon(UsersThree)}
            label={team.isLead ? 'Your team' : 'Team'}
            value={`${joined} of ${team.members.length} joined`}
            onPress={() => router.push(`/hackathon/${eventId}/team`)}
          />
          <SettingsRow
            icon={unread ? icon(BellRinging) : icon(Bell)}
            label="Updates"
            value={unread ? `${unread} new` : undefined}
            onPress={() => router.push(`/hackathon/${eventId}/updates`)}
          />
        </SettingsGroup>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  emptyTitle: { fontSize: typography.fontSize.xl, textAlign: 'center', ...font('bold') },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...font() },
  idCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
    alignItems: 'center',
  },
  label: { fontSize: typography.fontSize.xs, letterSpacing: 0.5, ...font('medium') },
  teamCode: { marginTop: spacing[2], fontSize: typography.fontSize['5xl'], letterSpacing: 1, ...font('bold') },
  teamName: { marginTop: spacing[1], fontSize: typography.fontSize.lg, textAlign: 'center', ...font('medium') },
  stage: {
    marginTop: spacing[5],
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  stageTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  stageBody: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
