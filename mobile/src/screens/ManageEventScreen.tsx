import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bed,
  CalendarBlank,
  CalendarDots,
  ChartBar,
  Eye,
  FileCsv,
  HourglassMedium,
  Gavel,
  GearSix,
  Globe,
  Handshake,
  Lightning,
  ListBullets,
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
} from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useManageEvent } from '../hooks/useManageEvent';
import { getTeamStays } from '../lib/api/stays';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { relativeWhen } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;
const COVER_W = 120;
const COVER_H = 90; // 4:3
const SPACE_WEB_URL = 'https://space.unifesto.app';

function eventState(e: { status: string; startDateTime: string; endDateTime: string }, now: Date) {
  if (e.status === 'CANCELLED') return 'Cancelled';
  if (e.status === 'DRAFT') return 'Draft';
  const n = now.getTime();
  if (new Date(e.startDateTime).getTime() <= n && n <= new Date(e.endDateTime).getTime()) return 'Live now';
  if (new Date(e.endDateTime).getTime() < n) return 'Ended';
  return relativeWhen(e.startDateTime, now);
}

/**
 * The operator's hub for one event: headcount, live check-in progress and the
 * tools this user is allowed to use. Tools the server would refuse are hidden.
 */
export default function ManageEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const h = useManageEvent(eventId);
  // Crew don't get the Stay hub; they get the property desk (scan a Stay Pass,
  // take payment, check in) when the event has a published stay.
  const deskOnly = h.access.canScan && !h.access.hosts;
  const [hasStays, setHasStays] = useState(false);
  useEffect(() => {
    if (!eventId || !deskOnly) return;
    void getTeamStays(eventId).then((r) => setHasStays(r.ok && r.data.stays.some((s) => s.isPublished)));
  }, [eventId, deskOnly]);

  useAnalyticsScreenTracking('ManageEvent');

  if (h.loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (h.error || !h.event) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.muted, { color: tokens.textMuted }]}>{h.error || 'Event not found'}</Text>
        <Button label="Try again" variant="secondary" onPress={() => void h.retry()} style={{ marginTop: spacing[3] }} />
      </View>
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
  const ticketTypes = (e as unknown as { ticketTypes?: { kind: string }[] }).ticketTypes ?? [];
  const rsvpCount = ticketTypes.filter((t) => t.kind === 'RSVP').length;
  const ticketCount = ticketTypes.length - rsvpCount;
  const icon = (I: typeof QrCode) => <I size={ICON} color={tokens.accent} weight="fill" />;

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={h.refreshing}
          onRefresh={h.refresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {/* Identity */}
      <View style={styles.hero}>
        {e.coverImageUrl ? (
          <Image source={{ uri: e.coverImageUrl }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverEmpty, { backgroundColor: tokens.elevated }]}>
            <CalendarBlank size={28} color={tokens.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={3}>
            {e.title}
          </Text>
          <Text
            style={[styles.state, { color: state === 'Live now' ? tokens.success : state === 'Cancelled' ? tokens.danger : tokens.textMuted }]}
            numberOfLines={1}
          >
            {state}
          </Text>
          {e.venueName || e.city ? (
            <Text style={[styles.muted, { color: tokens.textMuted }]} numberOfLines={1}>
              {e.venueName || e.city}
            </Text>
          ) : null}
        </View>
      </View>

      {e.status === 'DRAFT' && h.access.hosts ? (
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
            { label: 'Attending', value: attending ?? 0 },
            { label: 'Checked in', value: checkedIn ?? 0 },
            ...(e.capacity ? [{ label: 'Seats left', value: Math.max(0, e.capacity - (attending ?? 0)) }] : []),
          ]}
        />
      </View>

      {h.checkin && checkinTotal > 0 ? (
        <View style={styles.progressWrap}>
          <View style={[styles.track, { backgroundColor: tokens.elevated }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: tokens.accent }]} />
          </View>
          <Text style={[styles.muted, { color: tokens.textMuted }]}>
            {Math.round(progress * 100)}% checked in · {h.checkin.remaining.toLocaleString('en-IN')} to go
          </Text>
        </View>
      ) : null}

      {/* Tools */}
      <View style={{ marginTop: spacing[8] }}>
        <SettingsGroup title="Run this event">
          {h.access.canScan ? (
            <SettingsRow
              icon={icon(QrCode)}
              label="Scan tickets"
              onPress={() => router.push({ pathname: `/checkin/${e.id}`, params: scanParams })}
            />
          ) : null}
          {h.access.canViewAttendees ? (
            <SettingsRow
              icon={icon(UsersThree)}
              label="Attendees"
              value={attending !== null ? attending.toLocaleString('en-IN') : undefined}
              onPress={() => router.push({ pathname: `/manage/event/${e.id}/attendees`, params: { title: e.title } })}
            />
          ) : null}
          {/* Adding people and the waiting list need event:manage-attendees; the server re-checks. */}
          {h.access.hosts && !e.isRecurring ? (
            <SettingsRow icon={icon(UserPlus)} label="Add attendee" onPress={() => router.push(`/manage/event/${e.id}/add-attendee`)} />
          ) : null}
          {h.access.hosts && !e.isRecurring ? (
            <SettingsRow icon={icon(FileCsv)} label="Import from CSV" onPress={() => router.push(`/manage/event/${e.id}/import-attendees`)} />
          ) : null}
          {h.access.hosts && !e.isRecurring ? (
            <SettingsRow icon={icon(HourglassMedium)} label="Waiting list" onPress={() => router.push(`/manage/event/${e.id}/waitlist`)} />
          ) : null}
          {h.access.canViewAttendees && h.access.hosts ? (
            <SettingsRow
              icon={icon(Receipt)}
              label="Transactions"
              onPress={() =>
                router.push({ pathname: `/manage/event/${e.id}/transactions`, params: { slug: e.slug, spaceId: e.spaceId } })
              }
            />
          ) : null}
          {h.access.hosts && !e.isRecurring ? (
            <SettingsRow
              icon={icon(Bed)}
              label="Unifesto Stay"
              onPress={() => router.push(`/manage/event/${e.id}/stays`)}
            />
          ) : deskOnly && hasStays ? (
            <SettingsRow
              icon={icon(Bed)}
              label="Scan Stay Pass"
              onPress={() => router.push({ pathname: `/manage/event/${e.id}/stay-scan`, params: { desk: '1' } })}
            />
          ) : null}
          {h.access.hosts ? (
            <SettingsRow
              icon={icon(WhatsappLogo)}
              label="WhatsApp group"
              onPress={() => router.push(`/manage/event/${e.id}/whatsapp`)}
            />
          ) : null}
          {h.access.hosts ? (
            <SettingsRow
              icon={icon(ChartBar)}
              label="Tracking"
              onPress={() =>
                router.push({ pathname: `/manage/event/${e.id}/tracking`, params: { title: e.title, slug: e.slug } })
              }
            />
          ) : null}
          {h.access.hosts ? (
            <SettingsRow
              icon={icon(Handshake)}
              label="Partners"
              onPress={() => router.push({ pathname: `/manage/event/${e.id}/partners`, params: { title: e.title } })}
            />
          ) : null}
          {h.access.hosts ? (
            <SettingsRow
              icon={icon(Trophy)}
              label="Hackathon"
              onPress={() => router.push(`/manage/event/${e.id}/hackathon`)}
            />
          ) : null}
          {h.access.canJudge ? (
            <SettingsRow
              icon={icon(Gavel)}
              label="Judging"
              onPress={() => router.push({ pathname: `/judging/${e.id}`, params: { title: e.title } })}
            />
          ) : null}
        </SettingsGroup>
      </View>

      {/* Setup — needs event:edit (Curator, Co-Curator, Space Admin); the server re-checks. */}
      {h.access.hosts ? (
        <View style={{ marginTop: spacing[6] }}>
          <SettingsGroup title="Set up">
            <SettingsRow icon={icon(PencilSimple)} label="Details" onPress={() => router.push(`/manage/event/${e.id}/edit`)} />
            <SettingsRow
              icon={icon(ListBullets)}
              label="Agenda, speakers and FAQs"
              onPress={() => router.push(`/manage/event/${e.id}/content`)}
            />
            <SettingsRow
              icon={icon(Ticket)}
              label="Tickets"
              value={ticketCount ? String(ticketCount) : undefined}
              onPress={() => router.push(`/manage/event/${e.id}/tickets`)}
            />
            <SettingsRow
              icon={icon(Lightning)}
              label="RSVPs"
              value={rsvpCount ? String(rsvpCount) : undefined}
              onPress={() => router.push(`/manage/event/${e.id}/rsvps`)}
            />
            {ticketCount > 0 ? (
              <SettingsRow icon={icon(SealPercent)} label="Discount codes" onPress={() => router.push(`/manage/event/${e.id}/coupons`)} />
            ) : null}
            <SettingsRow icon={icon(UsersFour)} label="Team" onPress={() => router.push(`/manage/event/${e.id}/team`)} />
            <SettingsRow icon={icon(ShareNetwork)} label="Co-hosts" onPress={() => router.push(`/manage/event/${e.id}/co-hosting`)} />
            {h.access.canSponsors ? (
              <SettingsRow
                icon={icon(Medal)}
                label="Sponsors"
                onPress={() => router.push({ pathname: `/manage/event/${e.id}/sponsors`, params: { spaceId: e.spaceId, title: e.title } })}
              />
            ) : null}
            {/* A series parent has dates; anything else can group sub-events (a series can't be both). */}
            {e.isRecurring ? (
              <SettingsRow icon={icon(CalendarDots)} label="Series dates" onPress={() => router.push(`/manage/event/${e.id}/series-dates`)} />
            ) : !e.seriesParentId ? (
              <SettingsRow icon={icon(TreeStructure)} label="Sub-events" onPress={() => router.push(`/manage/event/${e.id}/sub-events`)} />
            ) : null}
            {h.access.canPayout ? (
              <SettingsRow
                icon={icon(Wallet)}
                label="Request payout"
                onPress={() => router.push({ pathname: `/manage/event/${e.id}/payout`, params: { title: e.title } })}
              />
            ) : null}
            <SettingsRow icon={icon(GearSix)} label="Settings" onPress={() => router.push(`/manage/event/${e.id}/settings`)} />
          </SettingsGroup>
        </View>
      ) : null}

      {!h.access.canViewAttendees ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          The attendee list is only open to Space admins right now.
        </Text>
      ) : null}

      {/* Ticket mix */}
      {h.attendeeStats && h.attendeeStats.byTicketType.length > 0 ? (
        <View style={{ marginTop: spacing[6] }}>
          <SettingsGroup title="By ticket">
            {h.attendeeStats.byTicketType.map((t) => (
              <SettingsRow
                key={t.ticketTypeId ?? t.name}
                icon={<Text style={[styles.count, { color: tokens.text }]}>{t.attendees}</Text>}
                label={t.name}
                value={t.kind === 'GROUP' ? `${t.bookings} groups` : undefined}
              />
            ))}
          </SettingsGroup>
        </View>
      ) : null}

      <View style={{ marginTop: spacing[6] }}>
        <SettingsGroup>
          <SettingsRow icon={icon(Eye)} label="View public page" onPress={() => router.push(`/event/${e.slug || e.id}`)} />
          <SettingsRow
            icon={icon(Globe)}
            label="Open in Unifesto Space"
            external
            onPress={() =>
              Linking.openURL(`${SPACE_WEB_URL}/dashboard/events/${e.id}`).catch(() =>
                AppAlert.alert('Error', 'Unable to open Unifesto Space'),
              )
            }
          />
        </SettingsGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  hero: { flexDirection: 'row', gap: spacing[4], alignItems: 'center' },
  cover: { width: COVER_W, height: COVER_H, borderRadius: borderRadius.lg },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.2, ...font('heading') },
  state: { marginTop: 6, fontSize: typography.fontSize.sm, ...font('semibold') },
  muted: { fontSize: typography.fontSize.sm, ...font() },
  progressWrap: { marginTop: spacing[4], gap: spacing[2] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  note: { marginTop: spacing[3], fontSize: typography.fontSize.xs, ...font() },
  count: { width: ICON, textAlign: 'center', fontSize: typography.fontSize.base, ...font('semibold') },
});
