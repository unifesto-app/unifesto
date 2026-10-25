import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bed,
  CalendarPlus,
  CaretRight,
  Globe,
  MapPin,
  ShareNetwork,
  Ticket,
  WhatsappLogo,
  XCircle,
} from '@unifesto/unicon/react-native';
import FavoriteButton from '../components/FavoriteButton';
import Skeleton from '../components/Skeleton';
import AttendingShareModal from '../components/AttendingShareModal';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard, { CoverTag } from '../components/home/PosterCard';
import {
  AgendaSection,
  FaqSection,
  HostedBySection,
  PrizesSection,
  SpeakersSection,
  SponsorsSection,
} from '../components/event/EventSections';
import { RegisterBar, useActionBarSpace } from '../components/event/EventOverlays';
import NotifySheet from '../components/event/NotifySheet';
import { HeaderActions, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import VenueMap from '../components/event/VenueMap';
import { useEventDetail, type EventDetail } from '../hooks/useEventDetail';
import { useBannerAccent } from '../hooks/useBannerPalette';
import { useEventStays } from '../hooks/useEventStays';
import useTopSpacing from '../hooks/useTopSpacing';
import ReportSheet from '../components/ReportSheet';
import { brandHeaderOptions } from '../components/BrandHeaderTitle';
import { countdownLabel, dateChip, formatTime, relativeWhen, shortPrice } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CosmosWash, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import type { SubEvent } from '../lib/api/events';
import { coverOr, logoOr, useDefaultImages } from '../lib/defaultImages';
import { useBrandFont } from '../lib/brandFont';

const ICON = 24;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const shortDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Facts-card date lines: "Saturday" / "6:30 PM – 9:00 PM", or "12 Oct – 14 Oct" / "From 6:30 PM" across days. */
function whenLines(startIso: string, endIso?: string | null) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (!end || sameDay(start, end)) {
    return {
      title: start.toLocaleDateString('en-IN', { weekday: 'long' }),
      sub: `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}`,
    };
  }
  return { title: `${shortDate(start)} – ${shortDate(end)}`, sub: `From ${formatTime(start)}` };
}

/** Upcoming and live sub-events first (soonest first), finished ones after. */
function orderSubEvents(subs: SubEvent[]): SubEvent[] {
  const done = (s: SubEvent) => (s.status === 'COMPLETED' ? 1 : 0);
  return [...subs].sort((a, b) => done(a) - done(b) || a.startDateTime.localeCompare(b.startDateTime));
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const d = useEventDetail(id);
  // Fusion: the cosmos sky lit by the organiser's brand colour, else the
  // banner's most frequent hue. Null (plain sky) until extracted, or for a
  // banner that's only white / black / grey.
  const bannerHue = useBannerAccent(
    d.event?.coverImageUrl,
    d.event ? { event: d.event.slug ?? d.event.id } : null,
  );
  const hue = d.event?.branding?.color || bannerHue;
  return (
    <CosmosWash active={!!hue}>
      <EventDetailView id={id} d={d} hue={hue} />
    </CosmosWash>
  );
}

function EventDetailView({ id, d, hue }: { id?: string; d: EventDetail; hue: string | null }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const barSpace = useActionBarSpace();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  // Y of the "Events inside" rail, so an umbrella's CTA lands on it.
  const subEventsY = useRef<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const { event } = d;
  const brandFont = useBrandFont(event?.branding?.font);
  const [descExpanded, setDescExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Unifesto Stay: shown to signed-in viewers when the event offers stays.
  const stay = useEventStays(event?.id, !!d.user && !!event && event.type !== 'ONLINE');

  const bannerW = width - GUTTER * 2;
  const bannerH = Math.round((bannerW * 3) / 4); // event banners are 4:3

  // A case about this event; the backend sends it to the organiser's desk (D2).
  const getHelp = () => {
    if (!event) return;
    if (!d.user) return AppAlert.alert('Sign in required', 'Please sign in to ask for help.');
    router.push({ pathname: '/manage/support/assist', params: { eventId: event.id, about: event.title } });
  };

  // Header actions: save + one overflow menu. Plain icons, no backgrounds.
  useLayoutEffect(() => {
    navigation.setOptions({
      ...brandHeaderOptions(event?.branding),
      headerRight: () => (
        <HeaderActions>
          {event ? (
            <View style={styles.headerIcon}>
              <FavoriteButton
                eventId={event.id}
                size={24}
                color={c.text}
              />
            </View>
          ) : null}
          <HeaderMenu
            title={event?.title || 'Event'}
            items={[
              { id: 'share', title: 'Share', icon: MENU_ICONS.share },
              { id: 'copy', title: 'Copy link', icon: MENU_ICONS.copyLink },
              { id: 'calendar', title: 'Add to calendar', icon: MENU_ICONS.calendar },
              { id: 'notify', title: 'Notify me', icon: MENU_ICONS.notify },
              { id: 'help', title: 'Get help', icon: MENU_ICONS.help },
              { id: 'report', title: 'Report event', icon: MENU_ICONS.report, destructive: true },
            ]}
            onSelect={(action) => {
              if (action === 'share') d.share();
              else if (action === 'copy') d.copyLink();
              else if (action === 'calendar') d.addToCalendar();
              else if (action === 'notify') d.notify.openSheet();
              else if (action === 'help') getHelp();
              else if (action === 'report') setReportOpen(true);
            }}
          />
        </HeaderActions>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, event, d.user, c.text, d.share, d.copyLink, d.addToCalendar, d.notify.openSheet]);

  // ── Loading / missing ─────────────────────────────────────────────────────
  if (d.loading) {
    return (
      <View style={[styles.flex, { backgroundColor: c.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <CosmosBackdrop horizon={false} />
        <Skeleton width={bannerW} height={bannerH} borderRadius={cosmosCardRadius} />
        <Skeleton width="85%" height={28} borderRadius={8} style={{ marginTop: spacing[6] }} />
        <Skeleton width="50%" height={16} borderRadius={8} style={{ marginTop: spacing[3] }} />
        <Skeleton width="100%" height={196} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <XCircle size={48} color={c.muted} />
        <Text style={[styles.emptyTitle, { color: c.text }]}>{d.spaceUnavailable ? 'This space is temporarily unavailable' : id ? 'Event not found' : 'No event selected'}</Text>
        <AuthButton label="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing[6], minWidth: 160 }} />
      </View>
    );
  }

  // ── Derived display bits ──────────────────────────────────────────────────
  const isOnline = event.type === 'ONLINE';
  const isCancelled = event.status === 'CANCELLED';
  // In-person venue for the embedded map: exact coordinates when the organiser
  // set them, otherwise a name + address search.
  const venueCoords =
    !isOnline && event.latitude != null && event.longitude != null
      ? { latitude: Number(event.latitude), longitude: Number(event.longitude) }
      : null;
  const venuePlace = {
    name: event.venueName,
    address: event.venueAddress,
    city: event.city,
    state: event.state,
    country: event.country,
  };
  const hasVenue = !isOnline && !!(event.venueName || event.venueAddress || event.city);
  const venueName = event.venueName || event.city || 'Venue';
  const venueAddress = [event.venueAddress, event.venueName ? event.city : null].filter(Boolean).join(', ') || null;
  const hosts = event.space
    ? [event.space.name, ...(event.coHosts ?? []).map((h) => h.name)].join(' & ')
    : null;
  const cover = coverOr(defaults, event.id, event.coverImageUrl);
  const hostLogo = event.space ? logoOr(defaults, event.spaceId, event.space.logoUrl) : null;
  const tag = event.categories?.[0] ?? event.category;
  const description = event.description?.trim();
  const groupUrl = event.whatsappGroupUrl;
  const communityUrl = event.whatsappCommunityUrl ?? event.parentEvent?.whatsappCommunityUrl ?? null;
  const whatsappUrl = groupUrl || communityUrl;
  const chip = dateChip(event.startDateTime);
  const when = whenLines(event.startDateTime, event.endDateTime);
  // Countdown only while it's still ahead; the facts card covers ended / cancelled.
  const countdown = !d.isOver && !isCancelled ? countdownLabel(event.startDateTime) : null;
  const priceLine = d.bigEventMode === 'umbrella'
    ? `${d.subEventCount} sub-event${d.subEventCount === 1 ? '' : 's'}`
    : d.priceDisplay;
  // Bar splits "Starting from ₹199" into a small label and a large value.
  const barPrice = d.bigEventMode === 'umbrella'
    ? { label: 'Multi-part event', value: priceLine }
    : d.priceDisplay.startsWith('Starting from ')
      ? { label: 'Starting from', value: d.priceDisplay.replace('Starting from ', '') }
      : { label: 'Entry', value: d.priceDisplay };

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} hue={hue} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: barSpace }}
        refreshControl={
          <RefreshControl
            refreshing={d.refreshing}
            onRefresh={d.refresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {/* ── Hero: clean 4:3 cover, then the name and who's behind it ── */}
        <View style={{ paddingHorizontal: GUTTER }}>
          <View style={[styles.banner, { width: bannerW, height: bannerH, backgroundColor: c.card }]}>
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            {tag ? <CoverTag label={tag} style={styles.coverTag} /> : null}
          </View>

          {event.parentEvent ? (
            <Pressable
              onPress={() => router.push(`/event/${event.parentEvent!.slug}`)}
              style={({ pressed }) => [styles.partOf, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="link"
            >
              <Text style={[styles.partOfText, { color: c.muted }]} numberOfLines={1}>
                Part of <Text style={{ color: c.text, ...cosmosFont.strong }}>{event.parentEvent.title}</Text>
              </Text>
              <CaretRight size={12} color={c.muted} />
            </Pressable>
          ) : null}

          <Text style={[styles.title, { color: c.text }, !event.parentEvent && { marginTop: spacing[6] }, brandFont && { fontFamily: brandFont }]}>
            {event.title}
          </Text>

          {hosts && event.space ? (
            <Pressable
              onPress={() => router.push(`/space/${event.spaceId}`)}
              style={({ pressed }) => [styles.host, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="link"
            >
              {/* Space logos are 1:1. */}
              {hostLogo ? (
                <Image source={{ uri: hostLogo }} style={[styles.hostLogo, { backgroundColor: c.card }]} />
              ) : (
                <View style={[styles.hostLogo, styles.center, { backgroundColor: c.card }]}>
                  <Text style={[styles.hostInitial, { color: c.muted }]}>{event.space.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[styles.hostText, { color: c.muted }]} numberOfLines={1}>
                by <Text style={{ color: c.text, ...cosmosFont.strong }}>{hosts}</Text>
              </Text>
            </Pressable>
          ) : null}

          {/* ── Facts: a ticket-stub date, then where, entry and stay ── */}
          <View style={[styles.facts, { backgroundColor: c.raised }]}>
            <Pressable
              onPress={d.addToCalendar}
              accessibilityRole="button"
              accessibilityLabel={`${when.title}, ${when.sub}. Add to calendar`}
              style={({ pressed }) => [styles.whenRow, pressed && { backgroundColor: c.tint }]}
            >
              <View style={[styles.stub, { borderColor: c.border }]}>
                <Text style={[styles.stubMonth, { color: c.muted }]}>{chip.month}</Text>
                <Text style={[styles.stubDay, { color: c.text }]}>{chip.day}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.factTitle, { color: c.text }]} numberOfLines={1}>{when.title}</Text>
                <Text style={[styles.factSub, { color: c.soft }]} numberOfLines={1}>{when.sub}</Text>
                {countdown ? <Text style={[styles.factSub, { color: c.muted }]}>{countdown}</Text> : null}
              </View>
              <CalendarPlus size={ICON} color={c.text} />
            </Pressable>

            <Divider />
            {isOnline ? (
              <Fact icon={<Globe size={ICON} color={c.text} />} title="Online" sub={event.onlinePlatform} />
            ) : hasVenue || venueCoords ? (
              <Fact icon={<MapPin size={ICON} color={c.text} />} title={venueName} sub={venueAddress} onPress={d.openMaps} />
            ) : (
              <Fact icon={<MapPin size={ICON} color={c.muted} />} title="Venue to be announced" />
            )}

            <Divider />
            {isCancelled ? (
              <Fact icon={<XCircle size={ICON} color={c.danger} />} title="This event was cancelled" danger />
            ) : d.isOver ? (
              <Fact icon={<Ticket size={ICON} color={c.muted} />} title="This event has ended" />
            ) : (
              <Fact icon={<Ticket size={ICON} color={c.text} />} title={priceLine} />
            )}

            {stay && !isCancelled ? (
              <>
                <Divider />
                <Fact
                  icon={<Bed size={ICON} color={c.text} />}
                  title={stay.label}
                  sub={stay.value}
                  onPress={() => router.push(stay.href as never)}
                />
              </>
            ) : null}
          </View>

          {/* ── Attendee actions ── */}
          {(d.user && d.ownsAnyTicket) || whatsappUrl ? (
            <View style={styles.actions}>
              {d.user && d.ownsAnyTicket ? (
                <AuthButton
                  label="I'm going"
                  variant="secondary"
                  icon={<ShareNetwork size={18} color={c.text} />}
                  onPress={() => setShareOpen(true)}
                  style={styles.flex}
                />
              ) : null}
              {whatsappUrl ? (
                <AuthButton
                  label={`Join ${groupUrl ? 'group' : 'community'}`}
                  variant="secondary"
                  icon={<WhatsappLogo size={18} color="#25D366" weight="fill" />}
                  onPress={() => Linking.openURL(whatsappUrl)}
                  style={styles.flex}
                />
              ) : null}
            </View>
          ) : null}
        </View>

        {description ? (
          <Section title="About">
            <View style={{ paddingHorizontal: GUTTER }}>
              <Text style={[styles.body, { color: c.soft }]} numberOfLines={descExpanded ? undefined : 6}>
                {description}
              </Text>
              {description.length > 240 ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.link, { color: c.text }]}>{descExpanded ? 'Show less' : 'Read more'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* Sub-events of a big event */}
        {event.childEvents && event.childEvents.length > 0 ? (
          <View onLayout={(ev) => { subEventsY.current = ev.nativeEvent.layout.y; }}>
            <Section title="Events inside" subtitle={`${event.childEvents.length} to choose from`}>
              <Rail>
                {orderSubEvents(event.childEvents).map((sub) => (
                  <PosterCard
                    key={sub.id}
                    title={sub.title}
                    imageUrl={sub.coverImageUrl}
                    when={relativeWhen(sub.startDateTime)}
                    where={sub.venueName || sub.city}
                    price={sub.status === 'COMPLETED' ? 'Ended' : shortPrice(sub)}
                    onPress={() => router.push(`/event/${sub.slug}`)}
                  />
                ))}
              </Rail>
            </Section>
          </View>
        ) : null}

        {d.agenda.length > 0 ? <AgendaSection items={d.agenda} /> : null}
        {d.speakers.length > 0 ? <SpeakersSection items={d.speakers} /> : null}
        {d.prizes.length > 0 ? <PrizesSection items={d.prizes} /> : null}

        {hasVenue || venueCoords ? (
          <Section title="Location">
            <View style={{ paddingHorizontal: GUTTER }}>
              <VenueMap
                coords={venueCoords}
                place={venuePlace}
                name={venueName}
                address={venueAddress}
                accent={c.text}
                onDirections={d.openMaps}
              />
            </View>
          </Section>
        ) : null}

        {event.sponsors && event.sponsors.length > 0 ? (
          <SponsorsSection
            items={event.sponsors}
            optedIn={d.sponsorOptIns}
            pending={d.sponsorPending}
            onToggle={d.toggleSponsorOptIn}
          />
        ) : null}
        {d.faqs.length > 0 ? <FaqSection items={d.faqs} /> : null}
        <HostedBySection
          // Same logo the space page shows (its default when none is set), never an initial.
          space={event.space ? { ...event.space, logoUrl: event.branding?.logoUrl || hostLogo } : event.space}
          coHosts={event.coHosts?.map((h) => ({ ...h, logoUrl: logoOr(defaults, h.id, h.logoUrl) }))}
          curators={event.curators}
          contacts={d.contacts}
          onOpenSpace={(spaceId) => router.push(`/space/${spaceId}`)}
        />
      </ScrollView>

      {!d.isOver ? (
        <RegisterBar
          price={barPrice}
          mode={d.registerMode}
          accent={c.primary}
          backdropImage={event.coverImageUrl}
          backdropColor={c.bg}
          onPress={
            // An umbrella parent has no registration of its own: jump to its sub-events.
            d.registerMode === 'umbrella' ? () => scrollRef.current?.scrollTo({ y: Math.max(0, (subEventsY.current ?? bannerH) - topSpacing), animated: true }) : d.handleRegister
          }
        />
      ) : null}

      <AttendingShareModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        event={{
          title: event.title,
          dateLabel: new Date(event.startDateTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          startIso: event.startDateTime,
          venueLabel: event.venueName || event.city || null,
          bannerUrl: event.coverImageUrl,
          spaceLogoUrl: event.space?.logoUrl,
        }}
      />

      <NotifySheet notify={d.notify} accent={c.primary} eventTitle={d.event?.title} />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="EVENT"
        targetId={d.event?.id}
        subject={d.event?.title}
      />
    </View>
  );
}

function Divider() {
  const c = useCosmos();
  return <View style={[styles.divider, { backgroundColor: c.border }]} />;
}

/** One line of the facts card: bare icon, title, optional quieter line under it. */
function Fact({ icon, title, sub, danger, onPress }: {
  icon: React.ReactNode;
  title: string;
  sub?: string | null;
  danger?: boolean;
  onPress?: () => void;
}) {
  const c = useCosmos();
  const content = (
    <>
      <View style={styles.factIcon}>{icon}</View>
      <View style={styles.flex}>
        <Text style={[styles.factTitle, { color: danger ? c.danger : c.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.factSub, { color: c.soft }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {onPress ? <CaretRight size={15} color={c.muted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.factRow}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.factRow, pressed && { backgroundColor: c.tint }]}
    >
      {content}
    </Pressable>
  );
}

const STUB = 56;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  coverTag: { position: 'absolute', left: spacing[4], bottom: spacing[4] },
  partOf: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing[6] },
  partOfText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  // Michroma runs wide: 24 reads like a 30 in a narrower face.
  title: { marginTop: spacing[2], fontSize: 24, lineHeight: 33, ...cosmosFont.display },
  host: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  hostLogo: { width: 26, height: 26, borderRadius: 7, overflow: 'hidden' },
  hostInitial: { fontSize: 11, ...cosmosFont.display },
  hostText: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  facts: { marginTop: spacing[6], borderRadius: cosmosCardRadius, overflow: 'hidden' },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] },
  stub: {
    width: STUB,
    height: STUB,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stubMonth: { fontSize: 11, ...cosmosFont.strong },
  stubDay: { marginTop: 1, fontSize: 20, lineHeight: 24, ...cosmosFont.figure },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  // Same column as the date stub, so every line's text starts at one edge.
  factIcon: { width: STUB, alignItems: 'center' },
  factTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  factSub: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing[4] + STUB + spacing[4] },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.6, ...cosmosFont.body },
  link: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  emptyTitle: { marginTop: spacing[4], fontSize: 17, ...cosmosFont.display },
});
