import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowUpRight, Gavel, Handshake, QrCode } from '@unifesto/unicon/react-native';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { useWorkspaceCards } from '../hooks/useWorkspaceCards';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import StatusBarScrim from '../components/ui/StatusBarScrim';
import { CardBackdrop } from '../components/ui/CardSurface';
import Skeleton from '../components/Skeleton';
import { GUTTER, Rail, Section } from '../components/home/Section';
import SpacePanel, { LinkRow } from '../components/home/SpacePanel';
import { Monogram } from '../components/home/SpaceCards';
import SponsorMark from '../components/manage/SponsorMark';
import { activeEvents, adminSpaces, hostedSpaces, hostingRoleLabel } from '../lib/spaceSections';
import type { CheckinEvent } from '../lib/api/checkin';
import type { OperatorSpace } from '../lib/api/spaceAccess';
import { relativeWhen } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const SPACE_WEB_URL = 'https://space.unifesto.app';
const TILE_W = 156;
const TILE_LOGO = 48;

/**
 * The operator tab, in the cosmos theme. Shown only to Space Admins, Curators,
 * Co-Curators, Crew, Judges, Mentors and sponsor staff. Top to bottom:
 * what's happening now (live check-ins + my next hosted events), my spaces,
 * then check-in / judging / sponsoring, each only for the roles that need it.
 */
export default function SpaceScreen() {
  const router = useRouter();
  const c = useCosmos();
  const topInset = useStableTopInset();
  const { sections, loaded, spaces, checkinEvents, judgingEvents, sponsorships, refresh } = useSpaceAccess();
  const w = useWorkspaceCards();
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Space');

  // Pick up new assignments whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Lost every operator role while sitting here: the tab is gone, so leave it.
  useEffect(() => {
    if (loaded && sections.length === 0) router.navigate('/(tabs)');
  }, [loaded, sections.length, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    await w.refresh();
    setRefreshing(false);
  };

  const now = new Date();
  const hosted = hostedSpaces(spaces);
  const creatable = adminSpaces(hosted);
  const live = new Set(w.liveCheckins.map((e) => e.id));
  // Live ones already lead the page; this list is what's still to come.
  const laterCheckins = activeEvents(checkinEvents, now).filter((e) => !live.has(e.id));
  const judging = activeEvents(judgingEvents, now);
  const summary = summaryLine({ live: w.liveCheckins.length, upcoming: w.upcoming.filter((e) => e.status !== 'DRAFT').length, spaces: hosted.length });

  const scan = (e: CheckinEvent) =>
    router.push({
      pathname: `/checkin/${e.id}`,
      params: { title: e.title, startDateTime: e.startDateTime, venueName: e.venueName || e.city || '' },
    });

  // New event goes straight to the form; with several spaces, ask which one.
  const newEvent = () => {
    const open = (id: string) => router.push(`/manage/space/${id}/new-event`);
    if (creatable.length === 1) return open(creatable[0].id);
    AppAlert.alert('New event in…', undefined, [
      ...creatable.map((s) => ({ text: s.name, onPress: () => open(s.id) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const openWeb = () =>
    Linking.openURL(SPACE_WEB_URL).catch(() => AppAlert.alert('Error', 'Unable to open Unifesto Space'));

  const glyph = { size: 24, color: c.primary };
  const hosting = sections.includes('hosting');

  // A plain View wraps the ScrollView so the native tab host doesn't add its
  // own safe-area inset on top of the header's (see mobile-tab-top-spacing).
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topInset}
          />
        }
      >
        <View style={{ paddingTop: topInset + spacing[4], paddingHorizontal: GUTTER }}>
          <Text style={[styles.title, { color: c.text }]}>My space</Text>
          {summary ? <Text style={[styles.summary, { color: c.soft }]}>{summary}</Text> : null}
        </View>

        {!loaded ? (
          <View style={[styles.pad, { marginTop: spacing[8], gap: spacing[3] }]}>
            <Skeleton width="100%" height={88} borderRadius={cosmosCardRadius} />
            <Skeleton width="100%" height={180} borderRadius={cosmosCardRadius} />
          </View>
        ) : (
          <>
            {hosting || w.liveCheckins.length > 0 ? (
              <Section title="Up next" style={styles.first}>
                <SpacePanel
                  liveCheckins={w.liveCheckins}
                  upcoming={w.upcoming}
                  loadingUpcoming={w.loadingUpcoming}
                  hosting={hosting}
                  canCreate={creatable.length > 0}
                  judging={[]}
                  sponsorships={[]}
                  onScan={scan}
                  onOpenEvent={(e) => router.push(`/manage/event/${e.id}`)}
                  onCreateEvent={newEvent}
                  onOpenJudging={() => {}}
                  onOpenSponsor={() => {}}
                />
              </Section>
            ) : null}

            {hosting ? (
              <Section title="My spaces" subtitle="Events, team and money for each space">
                <Rail>
                  {hosted.map((s) => (
                    <SpaceTile key={s.id} space={s} onPress={() => router.push(`/manage/space/${s.id}`)} />
                  ))}
                  <Pressable
                    onPress={openWeb}
                    accessibilityRole="link"
                    accessibilityLabel="Manage on the web"
                    style={({ pressed }) => [
                      styles.tile,
                      styles.web,
                      { borderColor: c.outline, transform: [{ scale: pressed ? 0.97 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.tileName, { color: c.text, marginTop: 0 }]}>Manage on the web</Text>
                    <Text style={[styles.tileMeta, { color: c.muted }]}>Billing, payouts and branding</Text>
                    <ArrowUpRight size={18} color={c.text} style={{ marginTop: spacing[4] }} />
                  </Pressable>
                </Rail>
              </Section>
            ) : null}

            {sections.includes('checkin') ? (
              <Section title="Check-in" subtitle={w.liveCheckins.length > 0 ? 'Later on' : undefined}>
                <Card>
                  {laterCheckins.length === 0 ? (
                    <Text style={[styles.empty, { color: c.muted }]}>
                      {w.liveCheckins.length > 0 ? 'Nothing else coming up.' : 'No events to check in right now.'}
                    </Text>
                  ) : (
                    laterCheckins.map((e) => (
                      <LinkRow
                        key={e.id}
                        icon={<QrCode {...glyph} />}
                        title={e.title}
                        meta={`${relativeWhen(e.startDateTime, now)} · ${e._count.registrations.toLocaleString('en-IN')} registered`}
                        onPress={() => scan(e)}
                      />
                    ))
                  )}
                </Card>
              </Section>
            ) : null}

            {sections.includes('judging') ? (
              <Section title="Judging">
                <Card>
                  {(judging.length > 0 ? judging : judgingEvents).map((j) => (
                    <LinkRow
                      key={j.boardId}
                      icon={<Gavel {...glyph} />}
                      title={j.title}
                      meta={`${j.kind === 'MENTOR' ? 'Mentor' : 'Judge'} · ${
                        j.activeRounds > 0
                          ? `${j.activeRounds} round${j.activeRounds === 1 ? '' : 's'} open`
                          : relativeWhen(j.startDateTime, now)
                      }`}
                      onPress={() => router.push({ pathname: `/judging/${j.eventId}`, params: { title: j.title } })}
                    />
                  ))}
                </Card>
              </Section>
            ) : null}

            {sections.includes('sponsoring') ? (
              <Section title="Sponsoring">
                <Card>
                  {sponsorships.map((sp) => {
                    const ready = sp.events.some((e) => e.leadCaptureEnabled);
                    return (
                      <LinkRow
                        key={sp.sponsorId}
                        icon={sp.logoUrl ? <SponsorMark name={sp.name} logoUrl={sp.logoUrl} size={28} /> : <Handshake {...glyph} />}
                        title={sp.name}
                        meta={
                          sp.leadCount
                            ? `${sp.leadCount} lead${sp.leadCount === 1 ? '' : 's'} captured`
                            : ready
                              ? 'Ready to scan'
                              : `Sponsoring ${sp.spaceName}`
                        }
                        onPress={() => router.push(`/sponsoring/${sp.sponsorId}`)}
                      />
                    );
                  })}
                </Card>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

/**
 * One quiet line under the title that sums up the moment, e.g.
 * "2 check-ins live · 3 events coming up". Null hides it.
 */
function summaryLine(n: { live: number; upcoming: number; spaces: number }): string | null {
  const parts = [
    n.live ? `${n.live} check-in${n.live === 1 ? '' : 's'} live` : null,
    n.upcoming ? `${n.upcoming} event${n.upcoming === 1 ? '' : 's'} coming up` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Card holding a list of rows (same surface as the Home operator panel). */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.pad}>
      <View style={styles.cardInner}>
        <CardBackdrop shape={styles.cardInner} />
        {children}
      </View>
    </View>
  );
}

/** A hosted space: 1:1 logo, my role, name. Opens the space's manage hub. */
function SpaceTile({ space, onPress }: { space: OperatorSpace; onPress: () => void }) {
  const c = useCosmos();
  const role = hostingRoleLabel(space);
  const events = space.eventAccess.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={role ? `${space.name}, ${role}` : space.name}
      style={({ pressed }) => [styles.tile, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <CardBackdrop shape={styles.tile} />
      <View style={styles.tileTop}>
        {space.logo_url ? (
          <Image source={{ uri: space.logo_url }} style={[styles.tileLogo, { backgroundColor: c.card }]} contentFit="cover" />
        ) : (
          <Monogram name={space.name} size={TILE_LOGO} radius={14} />
        )}
        {role ? (
          <View style={[styles.role, { backgroundColor: c.tint }]}>
            <Text style={[styles.roleText, { color: c.text }]}>{role}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileName, { color: c.text }]} numberOfLines={2}>{space.name}</Text>
      {/* Space Admins run the whole space; curators only the events they were given. */}
      <Text style={[styles.tileMeta, { color: c.muted }]} numberOfLines={1}>
        {space.userRole?.code === 'SPACE_ADMIN' ? 'All events' : `${events} event${events === 1 ? '' : 's'}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 140 },
  pad: { paddingHorizontal: GUTTER },
  title: { fontSize: 26, lineHeight: 34, ...cosmosFont.display },
  summary: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  first: { marginTop: spacing[8] },
  cardInner: { borderRadius: cosmosCardRadius, padding: spacing[4], gap: spacing[4] },
  empty: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  tile: { width: TILE_W, minHeight: 168, borderRadius: cosmosCardRadius, padding: spacing[4] },
  // The role pill wraps under the logo rather than truncating ("Space ad…").
  tileTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[2] },
  tileLogo: { width: TILE_LOGO, height: TILE_LOGO, borderRadius: 14, overflow: 'hidden' },
  role: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  roleText: { fontSize: 11, ...cosmosFont.strong },
  tileName: {
    marginTop: spacing[4],
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.25,
    ...cosmosFont.strong,
  },
  tileMeta: { marginTop: 3, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  web: { borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center' },
});
