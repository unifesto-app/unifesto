import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bed,
  ChartBar,
  ChatsCircle,
  Eye,
  FileCsv,
  HourglassMedium,
  Gavel,
  GearSix,
  Globe,
  Lightning,
  ListBullets,
  ListChecks,
  Star,
  Timer,
  Medal,
  PencilSimple,
  QrCode,
  SealPercent,
  TreeStructure,
  UserPlus,
  UsersFour,
  Receipt,
  ShareNetwork,
  Ticket,
  Trophy,
  UsersThree,
  Wallet,
  WhatsappLogo,
} from '@unifesto/unicon/react-native';
import { useManageEvent } from '../hooks/useManageEvent';
import { getTeamStays } from '../lib/api/stays';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { openSpaceWeb } from '../lib/openOnWeb';
import { relativeWhen } from '../utils/eventFormat';
import { useEventCover } from '../lib/defaultImages';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

type Row = React.ReactElement | null | false;

const ICON = 28;
const COVER_W = 120;
const COVER_H = 90; // 4:3

function eventState(e: { status: string; startDateTime: string; endDateTime: string }, now: Date) {
  if (e.status === 'CANCELLED') return 'Cancelled';
  if (e.status === 'DRAFT') return 'Draft';
  const n = now.getTime();
  if (new Date(e.startDateTime).getTime() <= n && n <= new Date(e.endDateTime).getTime()) return 'Live now';
  if (new Date(e.endDateTime).getTime() < n) return 'Ended';
  return relativeWhen(e.startDateTime, now);
}

/**
 * The operator's hub for one event: headcount, live check-in progress, then
 * the tools this user is allowed to use, one short list per job (check-in,
 * attendees, money, live, hackathon, insights, then the event's own setup).
 * Lists are rows on the page with full hairlines; glyphs carry their job's
 * accent. Tools the server would refuse are hidden, and so is a list left empty.
 */
export default function ManageEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const h = useManageEvent(eventId);
  // Crew don't get the Stay hub; they get the property desk (scan a Stay Pass,
  // take payment, check in) when the event has a published stay.
  const deskOnly = h.access.canScan && !h.access.hosts;
  const [hasStays, setHasStays] = useState(false);
  useEffect(() => {
    if (!eventId || !deskOnly) return;
    void getTeamStays(eventId).then((r) => setHasStays(r.ok && r.data.stays.some((s) => s.isPublished)));
  }, [eventId, deskOnly]);

  // The admin-set default banner when the event has none: never an icon in a tile.
  const cover = useEventCover(h.event);

  if (h.loading) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  if (h.error || !h.event) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: c.soft }]}>{h.error || 'Event not found'}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void h.retry()} style={{ marginTop: spacing[4] }} />
        </View>
      </CosmosScreen>
    );
  }

  const e = h.event;
  const now = new Date();
  const state = eventState(e, now);
  const attending = h.attendeeStats?.attendees ?? h.checkin?.total ?? null;
  const checkedIn = h.checkin?.checkedIn ?? null;
  const checkinTotal = h.checkin?.total ?? 0;
  const progress = checkinTotal > 0 && checkedIn !== null ? Math.min(1, checkedIn / checkinTotal) : 0;
  const scanParams = { title: e.title, startDateTime: e.startDateTime, venueName: e.venueName || e.city || '' };
  // Event day: from midnight on the start date until it ends (each day of a multi-day event).
  const dayStart = new Date(e.startDateTime);
  dayStart.setHours(0, 0, 0, 0);
  const eventDay = e.status !== 'DRAFT' && e.status !== 'CANCELLED' && now >= dayStart && now <= new Date(e.endDateTime);
  const web = (path = '') => () => openSpaceWeb(`/events/${e.id}${path}`, e.spaceId);
  const ticketTypes = (e as unknown as { ticketTypes?: { kind: string }[] }).ticketTypes ?? [];
  const rsvpCount = ticketTypes.filter((t) => t.kind === 'RSVP').length;
  const ticketCount = ticketTypes.length - rsvpCount;
  const icon = (I: typeof QrCode, color: string = c.text) => <I size={ICON} color={color} />;
  const hosts = h.access.hosts;
  // One job's list; skipped when this person can use none of its tools.
  const section = (title: string, rows: Row[]) => {
    const shown = rows.filter(Boolean);
    return shown.length ? (
      <SettingsGroup flat title={title}>
        {shown}
      </SettingsGroup>
    ) : null;
  };

  return (
    <CosmosScreen refreshing={h.refreshing} onRefresh={h.refresh} contentContainerStyle={styles.content}>
      {/* Identity */}
      <View style={styles.hero}>
        {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={3} accessibilityRole="header">
            {e.title}
          </Text>
          <View style={styles.stateRow}>
            {state === 'Live now' ? <View style={[styles.dot, { backgroundColor: c.mint }]} /> : null}
            <Text
              style={[styles.state, { color: state === 'Live now' ? c.mint : state === 'Cancelled' ? c.danger : c.muted }]}
              numberOfLines={1}
            >
              {state}
            </Text>
          </View>
          {e.venueName || e.city ? (
            <Text style={[styles.muted, { color: c.muted }]} numberOfLines={1}>
              {e.venueName || e.city}
            </Text>
          ) : null}
        </View>
      </View>

      {eventDay ? (
        <Button
          label="Open event day"
          size="lg"
          fullWidth
          onPress={() => router.push(`/manage/event/${e.id}/day`)}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}

      {e.status === 'DRAFT' && h.access.canPublish ? (
        <Button
          label="Review and publish"
          size="lg"
          fullWidth
          onPress={() => router.push(`/manage/event/${e.id}/settings`)}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}

      {/* Numbers */}
      <View style={{ marginTop: spacing[6] }}>
        <ManageStats
          stats={[
            { label: 'Attending', value: attending ?? 0, tone: 'sky' },
            { label: 'Checked in', value: checkedIn ?? 0, tone: 'mint' },
            ...(e.capacity ? [{ label: 'Seats left', value: Math.max(0, e.capacity - (attending ?? 0)), tone: 'sky' as const }] : []),
          ]}
        />
      </View>

      {/* On the page, so the bar stays monochrome: the mint lives on the card above. */}
      {h.checkin && checkinTotal > 0 ? (
        <View style={styles.progressWrap}>
          <View style={[styles.track, { backgroundColor: c.tint }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: c.primary }]} />
          </View>
          <Text style={[styles.muted, { color: c.muted }]}>
            {Math.round(progress * 100)}% checked in · {h.checkin.remaining.toLocaleString('en-IN')} to go
          </Text>
        </View>
      ) : null}

      {/* Tickets sold by type: numbers, so they sit with the numbers. */}
      {h.attendeeStats && h.attendeeStats.byTicketType.length > 0
        ? section(
            'By ticket',
            h.attendeeStats.byTicketType.map((t) => (
              <SettingsRow
                key={t.ticketTypeId ?? t.name}
                icon={<Text style={[styles.count, { color: c.sky }]}>{t.attendees}</Text>}
                label={t.name}
                value={t.kind === 'GROUP' ? `${t.bookings} groups` : undefined}
              />
            )),
          )
        : null}

      {/* Mint: the door and anything live. */}
      {section('Check-in', [
        h.access.canScan && (
          <SettingsRow
            key="scan"
            icon={icon(QrCode, c.mint)}
            label="Scan tickets"
            onPress={() => router.push({ pathname: `/checkin/${e.id}`, params: scanParams })}
          />
        ),
        // Crew don't get the Stay hub; they scan Stay Passes at the property desk.
        !hosts && deskOnly && hasStays && (
          <SettingsRow
            key="stay-scan"
            icon={icon(Bed, c.mint)}
            label="Scan Stay Pass"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/stay-scan`, params: { desk: '1' } })}
          />
        ),
      ])}

      {/* Sky: tickets, registrations, the people who hold them.
          Adding people and the waiting list need event:manage-attendees; the server re-checks. */}
      {section('Attendees', [
        h.access.canViewAttendees && (
          <SettingsRow
            key="attendees"
            icon={icon(UsersThree, c.sky)}
            label="Attendees"
            value={attending !== null ? attending.toLocaleString('en-IN') : undefined}
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/attendees`, params: { title: e.title } })}
          />
        ),
        hosts && <SettingsRow key="add" icon={icon(UserPlus, c.sky)} label="Add attendee" onPress={() => router.push(`/manage/event/${e.id}/add-attendee`)} />,
        hosts && <SettingsRow key="csv" icon={icon(FileCsv, c.sky)} label="Import from CSV" external onPress={web('/attendees/import')} />,
        hosts && (
          <SettingsRow key="waitlist" icon={icon(HourglassMedium, c.sky)} label="Waiting list" onPress={() => router.push(`/manage/event/${e.id}/waitlist`)} />
        ),
        hosts && (
          <SettingsRow
            key="stay"
            icon={icon(Bed, c.sky)}
            label="Unifesto Stay"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/stays`, params: { spaceId: e.spaceId } })}
          />
        ),
      ])}

      {!h.access.canViewAttendees ? (
        <Text style={[styles.note, { color: c.muted }]}>The attendee list is only open to Space admins right now.</Text>
      ) : null}

      {/* Ivory: money. */}
      {section('Money', [
        h.access.canViewAttendees && hosts && (
          <SettingsRow
            key="transactions"
            icon={icon(Receipt, c.ivory)}
            label="Transactions"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/transactions`, params: { slug: e.slug, spaceId: e.spaceId } })}
          />
        ),
        h.access.canPayout && (
          <SettingsRow
            key="payout"
            icon={icon(Wallet, c.ivory)}
            label="Request payout"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/payout`, params: { title: e.title } })}
          />
        ),
      ])}

      {/* Live polls, Q&A and quizzes need event:edit, which hosts have; the server re-checks. */}
      {section('Live', [
        hosts && <SettingsRow key="polls" icon={icon(ListChecks, c.mint)} label="Live polls" onPress={() => router.push(`/manage/event/${e.id}/polls`)} />,
        hosts && <SettingsRow key="qa" icon={icon(ChatsCircle, c.mint)} label="Live Q&A" onPress={() => router.push(`/manage/event/${e.id}/questions`)} />,
        hosts && <SettingsRow key="quizzes" icon={icon(Timer, c.mint)} label="Live quizzes" onPress={() => router.push(`/manage/event/${e.id}/quizzes`)} />,
        hosts && (
          <SettingsRow key="whatsapp" icon={icon(WhatsappLogo, c.mint)} label="WhatsApp group" onPress={() => router.push(`/manage/event/${e.id}/whatsapp`)} />
        ),
      ])}

      {section('Hackathon', [
        hosts && (
          <SettingsRow
            key="sprint"
            icon={icon(Trophy)}
            label="Unifesto Sprint"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/hackathon`, params: { spaceId: e.spaceId } })}
          />
        ),
        h.access.canJudge && (
          <SettingsRow
            key="judging"
            icon={icon(Gavel)}
            label="Judging"
            onPress={() => router.push({ pathname: `/judging/${e.id}`, params: { title: e.title } })}
          />
        ),
      ])}

      {/* F3: feedback results need event:edit, like the live tools above. */}
      {section('Insights', [
        hosts && (
          <SettingsRow
            key="feedback"
            icon={icon(Star, c.ivory)}
            label="Feedback"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/feedback`, params: { spaceId: e.spaceId } })}
          />
        ),
        hosts && (
          <SettingsRow
            key="tracking"
            icon={icon(ChartBar)}
            label="Tracking"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/tracking`, params: { title: e.title, slug: e.slug } })}
          />
        ),
      ])}

      {/* Setup needs event:edit (Curator, Co-Curator, Space Admin); the server re-checks.
          Editors are desk work, so most of these open the page on Unifesto Space (D3). */}
      {section('Event page', [
        hosts && <SettingsRow key="details" icon={icon(PencilSimple)} label="Details" external onPress={web('/edit')} />,
        hosts && <SettingsRow key="content" icon={icon(ListBullets)} label="Agenda, speakers and FAQs" external onPress={web('/content')} />,
        hosts && <SettingsRow key="sub" icon={icon(TreeStructure)} label="Sub-events" external onPress={web('/sub-events')} />,
        <SettingsRow key="public" icon={icon(Eye)} label="View public page" onPress={() => router.push(`/event/${e.slug || e.id}`)} />,
      ])}

      {section('Tickets', [
        hosts && (
          <SettingsRow
            key="tickets"
            icon={icon(Ticket, c.sky)}
            label="Tickets"
            value={ticketCount ? String(ticketCount) : undefined}
            external
            onPress={web('/tickets')}
          />
        ),
        hosts && (
          <SettingsRow
            key="rsvps"
            icon={icon(Lightning, c.sky)}
            label="RSVPs"
            value={rsvpCount ? String(rsvpCount) : undefined}
            external
            onPress={web('/rsvps')}
          />
        ),
        hosts && ticketCount > 0 && (
          <SettingsRow key="coupons" icon={icon(SealPercent, c.sky)} label="Discount codes" external onPress={web('/coupons')} />
        ),
      ])}

      {section('Team', [
        hosts && <SettingsRow key="team" icon={icon(UsersFour)} label="Team" onPress={() => router.push(`/manage/event/${e.id}/team`)} />,
        hosts && <SettingsRow key="cohosts" icon={icon(ShareNetwork)} label="Co-hosts" external onPress={web('/co-hosting')} />,
        hosts && h.access.canSponsors && (
          <SettingsRow
            key="sponsors"
            icon={icon(Medal)}
            label="Sponsors"
            onPress={() => router.push({ pathname: `/manage/event/${e.id}/sponsors`, params: { spaceId: e.spaceId, title: e.title } })}
          />
        ),
      ])}

      {section('More', [
        hosts && <SettingsRow key="settings" icon={icon(GearSix)} label="Settings" onPress={() => router.push(`/manage/event/${e.id}/settings`)} />,
        <SettingsRow key="space" icon={icon(Globe)} label="Open in Unifesto Space" external onPress={web()} />,
      ])}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { alignItems: 'center', marginTop: spacing[10] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  hero: { flexDirection: 'row', gap: spacing[4], alignItems: 'center' },
  cover: { width: COVER_W, height: COVER_H, borderRadius: cosmosCardRadius },
  title: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.25, ...cosmosFont.display },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  state: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  muted: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  progressWrap: { marginTop: spacing[4], gap: spacing[2] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  note: { marginTop: spacing[3], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  count: { width: ICON, textAlign: 'center', fontSize: typography.fontSize.base, ...cosmosFont.figure },
});
