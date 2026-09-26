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
  CalendarBlank,
  CaretRight,
  Globe,
  MapPin,
  ShareNetwork,
  Ticket,
  WhatsappLogo,
  XCircle,
} from 'phosphor-react-native';
import FavoriteButton from '../components/FavoriteButton';
import Skeleton from '../components/Skeleton';
import AttendingShareModal from '../components/AttendingShareModal';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard from '../components/home/PosterCard';
import {
  AgendaSection,
  ContactSection,
  CuratorsBlock,
  FaqSection,
  PrizesSection,
  SpeakersSection,
  SponsorsSection,
} from '../components/event/EventSections';
import { RegisterBar } from '../components/event/EventOverlays';
import NotifySheet from '../components/event/NotifySheet';
import { HeaderActions, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import VenueMap from '../components/event/VenueMap';
import BannerRim from '../components/ui/BannerRim';
import { useEventDetail } from '../hooks/useEventDetail';
import { useBannerPalette } from '../hooks/useBannerPalette';
import useTopSpacing from '../hooks/useTopSpacing';
import ReportSheet from '../components/ReportSheet';
import { useTokens } from '../context/ThemeContext';
import { formatTime, relativeWhen, shortPrice } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';
import { CardBackdrop, CardSurfaceProvider, DEFAULT_CARD_SURFACE } from '../components/ui/CardSurface';
import type { SubEvent } from '../lib/api/events';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Sat, 12 Oct · 6:30 PM – 9:00 PM", or "12 Oct – 14 Oct" across days. */
function whenLabel(startIso: string, endIso?: string | null) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (!end || sameDay(start, end)) {
    return `${dayLabel(start)} · ${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}`;
  }
  const short = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${short(start)} – ${short(end)} · ${formatTime(start)}`;
}

/** Upcoming and live sub-events first (soonest first), finished ones after. */
function orderSubEvents(subs: SubEvent[]): SubEvent[] {
  const done = (s: SubEvent) => (s.status === 'COMPLETED' ? 1 : 0);
  return [...subs].sort((a, b) => done(a) - done(b) || a.startDateTime.localeCompare(b.startDateTime));
}

export default function EventDetailScreen() {
  const tokens = useTokens();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  // Y of the "Events inside" rail, so an umbrella's CTA lands on it.
  const subEventsY = useRef<number | null>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const d = useEventDetail(id);
  const [reportOpen, setReportOpen] = useState(false);
  const { event } = d;
  const [descExpanded, setDescExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const accent = tokens.accent;
  // Page background: light → dark shades of the banner's most frequent colour.
  const palette = useBannerPalette(
    event?.coverImageUrl,
    event ? { event: event.slug ?? event.id } : null,
  );
  const bannerW = width - GUTTER * 2;
  const bannerH = Math.round((bannerW * 3) / 4); // event banners are 4:3

  // Header actions: save + one overflow menu. Plain icons, no backgrounds.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderActions>
          {event ? (
            <View style={styles.headerIcon}>
              <FavoriteButton
                eventId={event.id}
                size={24}
                color={tokens.text}
                onRequireAuth={() => AppAlert.alert('Sign in required', 'Please sign in to save events.')}
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
              { id: 'report', title: 'Report event', icon: MENU_ICONS.report, destructive: true },
            ]}
            onSelect={(action) => {
              if (action === 'share') d.share();
              else if (action === 'copy') d.copyLink();
              else if (action === 'calendar') d.addToCalendar();
              else if (action === 'notify') d.notify.openSheet();
              else if (action === 'report') setReportOpen(true);
            }}
          />
        </HeaderActions>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, event, tokens.text, d.share, d.copyLink, d.addToCalendar, d.notify.openSheet]);

  // ── Loading / missing ─────────────────────────────────────────────────────
  if (d.loading) {
    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <Skeleton width={bannerW} height={bannerH} borderRadius={borderRadius.xl} />
        <Skeleton width="85%" height={30} borderRadius={8} style={{ marginTop: spacing[5] }} />
        <Skeleton width="50%" height={16} borderRadius={8} style={{ marginTop: spacing[3] }} />
        <Skeleton width="100%" height={168} borderRadius={borderRadius.xl} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: tokens.bg }]}>
        <XCircle size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>{id ? 'Event not found' : 'No event selected'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.link, { color: accent }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Derived display bits ──────────────────────────────────────────────────
  const isOnline = event.type === 'ONLINE';
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
    ? [event.space.name, ...(event.coHosts ?? []).map((c) => c.name)].join(' & ')
    : null;
  const description = event.description?.trim();
  const groupUrl = event.whatsappGroupUrl;
  const communityUrl = event.whatsappCommunityUrl ?? event.parentEvent?.whatsappCommunityUrl ?? null;
  const whatsappUrl = groupUrl || communityUrl;
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
    <CardSurfaceProvider kind={palette ? 'glass' : DEFAULT_CARD_SURFACE}>
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      {palette ? (
        <LinearGradient
          colors={palette}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 150 }}
        refreshControl={
          <RefreshControl
            refreshing={d.refreshing}
            onRefresh={d.refresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      >
        <View style={{ paddingHorizontal: GUTTER }}>
          {/* Banner (4:3), kept clean: date lives in the facts card below */}
          <View style={[styles.banner, { width: bannerW, height: bannerH, backgroundColor: tokens.elevated }]}>
            {event.coverImageUrl ? (
              <Image source={{ uri: event.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={[accent, tokens.accentStrong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            {/* Corner light in the wash's top colour (what the banner sits on) */}
            <BannerRim radius={borderRadius.xl} color={palette?.[0]} />
          </View>

          {event.parentEvent ? (
            <Pressable
              onPress={() => router.push(`/event/${event.parentEvent!.slug}`)}
              style={styles.partOf}
              accessibilityRole="link"
            >
              <Text style={[styles.partOfText, { color: tokens.textSecondary }]} numberOfLines={1}>
                Part of <Text style={{ color: tokens.text, ...font('semibold') }}>{event.parentEvent.title}</Text>
              </Text>
              <CaretRight size={12} color={tokens.textMuted} weight="bold" />
            </Pressable>
          ) : null}

          <Text style={[styles.title, { color: tokens.text }, !event.parentEvent && { marginTop: spacing[5] }]}>
            {event.title}
          </Text>

          {hosts && event.space ? (
            <Pressable onPress={() => router.push(`/space/${event.spaceId}`)} style={styles.host} accessibilityRole="link">
              {/* Space logos are 1:1. */}
              {event.space.logoUrl ? (
                <Image source={{ uri: event.space.logoUrl }} style={[styles.hostLogo, { backgroundColor: tokens.elevated }]} />
              ) : (
                <View style={[styles.hostLogo, styles.center, { backgroundColor: tokens.elevated }]}>
                  <Text style={{ color: tokens.textSecondary, ...font('heading') }}>{event.space.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[styles.hostText, { color: tokens.textSecondary }]} numberOfLines={1}>
                by <Text style={{ color: tokens.text, ...font('semibold') }}>{hosts}</Text>
              </Text>
            </Pressable>
          ) : null}

          {/* The facts: when, where, price */}
          <SettingsGroup>
            <SettingsRow
              icon={<CalendarBlank size={24} color={accent} weight="duotone" />}
              label={whenLabel(event.startDateTime, event.endDateTime)}
              onPress={d.addToCalendar}
            />
            {isOnline ? (
              <SettingsRow icon={<Globe size={24} color={accent} weight="duotone" />} label="Online" />
            ) : !hasVenue && !venueCoords ? (
              <SettingsRow icon={<MapPin size={24} color={accent} weight="duotone" />} label="Venue to be announced" />
            ) : null}
            {event.status === 'CANCELLED' ? (
              <SettingsRow icon={<XCircle size={24} color={tokens.danger} weight="duotone" />} label="This event was cancelled" danger />
            ) : d.isOver ? (
              <SettingsRow icon={<Ticket size={24} color={tokens.textMuted} weight="duotone" />} label="This event has ended" />
            ) : (
              <SettingsRow icon={<Ticket size={24} color={accent} weight="duotone" />} label={priceLine} />
            )}
          </SettingsGroup>

          {/* Attendee actions */}
          {(d.user && d.ownsAnyTicket) || whatsappUrl ? (
            <View style={styles.actions}>
              {d.user && d.ownsAnyTicket ? (
                <ActionPill onPress={() => setShareOpen(true)}>
                  <ShareNetwork size={18} color={tokens.text} weight="bold" />
                  <Text style={[styles.actionText, { color: tokens.text }]}>I'm going</Text>
                </ActionPill>
              ) : null}
              {whatsappUrl ? (
                <ActionPill onPress={() => Linking.openURL(whatsappUrl)}>
                  <WhatsappLogo size={18} color="#25D366" weight="fill" />
                  <Text style={[styles.actionText, { color: tokens.text }]} numberOfLines={1}>
                    Join {groupUrl ? 'group' : 'community'}
                  </Text>
                </ActionPill>
              ) : null}
            </View>
          ) : null}

          {description ? (
            <View style={{ marginTop: spacing[8] }}>
              <Text style={[styles.blockTitle, { color: tokens.text }]}>About</Text>
              <Text style={[styles.body, { color: tokens.textSecondary }]} numberOfLines={descExpanded ? undefined : 6}>
                {description}
              </Text>
              {description.length > 240 ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8}>
                  <Text style={[styles.link, { color: accent }]}>{descExpanded ? 'Show less' : 'Read more'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Sub-events of a big event */}
        {event.childEvents && event.childEvents.length > 0 ? (
          <View onLayout={(ev) => { subEventsY.current = ev.nativeEvent.layout.y; }}>
            <Section title="Events inside">
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

        <View style={styles.sections}>
          {d.agenda.length > 0 ? <AgendaSection items={d.agenda} accent={accent} /> : null}
          {d.speakers.length > 0 ? <SpeakersSection items={d.speakers} accent={accent} /> : null}
          {event.sponsors && event.sponsors.length > 0 ? (
            <SponsorsSection
              items={event.sponsors}
              optedIn={d.sponsorOptIns}
              pending={d.sponsorPending}
              onToggle={d.toggleSponsorOptIn}
              accent={accent}
            />
          ) : null}
          {d.prizes.length > 0 ? <PrizesSection items={d.prizes} accent={accent} /> : null}
          {d.faqs.length > 0 ? <FaqSection items={d.faqs} /> : null}
          {d.contacts.length > 0 ? <ContactSection items={d.contacts} accent={accent} /> : null}
          {hasVenue || venueCoords ? (
            <View style={{ marginTop: spacing[4] }}>
              <Text style={[styles.blockTitle, { color: tokens.text }]}>Location</Text>
              <VenueMap
                coords={venueCoords}
                place={venuePlace}
                name={venueName}
                address={venueAddress}
                accent={accent}
                onDirections={d.openMaps}
              />
            </View>
          ) : null}
          {event.curators && event.curators.length > 0 ? (
            <View style={{ marginTop: spacing[4] }}>
              <CuratorsBlock items={event.curators} />
            </View>
          ) : null}
        </View>
      </ScrollView>

      {!d.isOver ? (
        <RegisterBar
          price={barPrice}
          mode={d.registerMode}
          accent={accent}
          backdropImage={event.coverImageUrl}
          backdropColor={palette?.[2]}
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

      <NotifySheet notify={d.notify} accent={accent} eventTitle={d.event?.title} />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="EVENT"
        targetId={d.event?.id}
        subject={d.event?.title}
      />
    </View>
    </CardSurfaceProvider>
  );
}

/** Pill button on the page's card surface (glass over the banner wash). */
function ActionPill({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <CardBackdrop style={styles.actionShape} />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  partOf: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing[5] },
  partOfText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...font() },
  title: {
    marginTop: spacing[2],
    fontSize: typography.fontSize['3xl'],
    lineHeight: typography.fontSize['3xl'] * 1.15,
    letterSpacing: -0.5,
    ...font('heading'),
  },
  host: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  hostLogo: { width: 26, height: 26, borderRadius: 7, overflow: 'hidden' },
  hostText: { flex: 1, fontSize: typography.fontSize.sm, ...font() },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 46,
    borderRadius: borderRadius.full,
  },
  actionShape: { borderRadius: 23 },
  actionText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  blockTitle: { fontSize: typography.fontSize.lg, marginBottom: spacing[2], ...font('heading') },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.55, ...font() },
  link: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  sections: { paddingHorizontal: GUTTER, marginTop: spacing[8], gap: spacing[3] },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, ...font('heading') },
});
