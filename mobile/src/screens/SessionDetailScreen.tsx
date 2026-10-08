import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CalendarPlus, CaretRight, CheckCircle, Clock, Ticket, UsersThree, VideoCamera, XCircle } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isPaidSessionBlocked, PAID_SESSION_IOS_NOTE, useSessionRegistration } from '../hooks/useSessionRegistration';
import useTopSpacing from '../hooks/useTopSpacing';
import { useBannerAccent } from '../hooks/useBannerPalette';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import { ActionBar, useActionBarSpace } from '../components/event/EventOverlays';
import { HeaderActions, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { googleCalendarUrl, outlookCalendarUrl } from '../lib/calendar';
import { countdownLabel } from '../utils/eventFormat';
import { getSessionBySlug, getMySessions, joinSession, PLATFORM_LABELS, type Session } from '../lib/api/sessions';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CosmosWash, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const ICON = 24;
const STUB = 56;
const LIVE_RED = '#ef4444';

/** Date and time parts in the session's own time zone. */
function whenParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-IN', { ...o, timeZone });
  return {
    month: part({ month: 'short' }),
    day: part({ day: 'numeric' }),
    weekday: part({ weekday: 'long' }),
    time: part({ hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase(),
  };
}

/** The session, whether I'm registered, and a reload. */
function useSessionData(slug: string) {
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const s = await getSessionBySlug(slug);
    setSession(s);
    if (s && user) {
      // Am I already registered? Look for this session in my registrations.
      const mine = await getMySessions().catch(() => []);
      setRegistered(mine.some((r) => r.session.id === s.id));
    }
    setLoading(false);
  }, [slug, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { user, session, registered, setRegistered, loading, load };
}

type SessionData = ReturnType<typeof useSessionData>;

/**
 * Online session page, same fusion look as the event page: the cosmos sky lit
 * by the cover's hue, a 4:3 cover, title and host, a facts card, about, and
 * the shared bottom action bar (sign in / register / join / watch recording).
 */
export default function SessionDetailScreen({ slug }: { slug: string }) {
  const data = useSessionData(slug);
  // No backend palette for sessions: the colour is picked on-device.
  const hue = useBannerAccent(data.session?.coverImageUrl, null);
  return (
    <CosmosWash active={!!hue}>
      <SessionDetailView data={data} hue={hue} />
    </CosmosWash>
  );
}

function SessionDetailView({ data, hue }: { data: SessionData; hue: string | null }) {
  const c = useCosmos();
  const tokens = useTokens();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const barSpace = useActionBarSpace();
  const { width } = useWindowDimensions();
  const { register, loading: registering } = useSessionRegistration();
  const { user, session, registered, setRegistered, loading, load } = data;
  const [joining, setJoining] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const bannerW = width - GUTTER * 2;
  const bannerH = Math.round((bannerW * 3) / 4);

  const addToCalendar = useCallback(() => {
    if (!session) return;
    const end = new Date(new Date(session.startDateTime).getTime() + (session.durationMinutes || 60) * 60000).toISOString();
    const cal = {
      slug: session.slug,
      title: session.title,
      startIso: session.startDateTime,
      endIso: end,
      description: session.description,
      location: 'Online',
    };
    AppAlert.alert('Add to calendar', session.title, [
      { text: 'Google Calendar', onPress: () => Linking.openURL(googleCalendarUrl(cal)) },
      { text: 'Outlook', onPress: () => Linking.openURL(outlookCalendarUrl(cal)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [session]);

  const upcoming = !!session && session.status !== 'CANCELLED' && session.status !== 'COMPLETED';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        session ? (
          <HeaderActions>
            <HeaderMenu
              title={session.title}
              items={[
                ...(upcoming ? [{ id: 'calendar', title: 'Add to calendar', icon: MENU_ICONS.calendar }] : []),
                ...(session.space ? [{ id: 'space', title: 'View space', icon: MENU_ICONS.website }] : []),
              ]}
              onSelect={(action) => {
                if (action === 'calendar') addToCalendar();
                else if (action === 'space' && session.space) router.push(`/space/${session.space.id}`);
              }}
            />
          </HeaderActions>
        ) : null,
    });
  }, [navigation, session, upcoming, addToCalendar, router]);

  async function handleRegister() {
    if (!session) return;
    if (!user) {
      AppAlert.alert('Sign in required', 'Please sign in to register for this session.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    const result = await register(session, user);
    if (result.cancelled) return; // backed out of payment
    if (!result.success) {
      AppAlert.alert('Could not register', result.error || 'Please try again.');
      return;
    }
    setRegistered(true);
    await load();
    AppAlert.alert("You're in", result.paid ? 'Payment confirmed. We’ll remind you before it starts.' : 'We’ll remind you before it starts.');
  }

  async function handleJoin() {
    if (!session) return;
    setJoining(true);
    try {
      const result = await joinSession(session.id);
      if (result.mode === 'livekit') {
        // In-app live room; the live screen fetches its own token.
        router.push(`/session/live/${session.id}`);
      } else if (result.meetingUrl) {
        await Linking.openURL(result.meetingUrl);
      } else {
        AppAlert.alert('Not available', 'No meeting link is set for this session.');
      }
    } catch (err: any) {
      // Usually the join window isn't open yet — show the server's message.
      AppAlert.alert('Not yet', err?.message || 'You can join closer to the start time.');
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.flex, { backgroundColor: c.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <CosmosBackdrop horizon={false} />
        <Skeleton width={bannerW} height={bannerH} borderRadius={cosmosCardRadius} />
        <Skeleton width="80%" height={26} borderRadius={8} style={{ marginTop: spacing[6] }} />
        <Skeleton width="100%" height={196} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <VideoCamera size={48} color={c.muted} />
        <Text style={[styles.emptyTitle, { color: c.text }]}>Session not found</Text>
        <AuthButton label="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing[6], minWidth: 160 }} />
      </View>
    );
  }

  const price = Number(session.price);
  const priceLabel = price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free';
  const isCancelled = session.status === 'CANCELLED';
  const isCompleted = session.status === 'COMPLETED';
  const platform = session.platform === 'OTHER' ? session.platformOther || 'Online' : PLATFORM_LABELS[session.platform];
  const minutes = session.durationMinutes || 60;
  const startMs = new Date(session.startDateTime).getTime();
  const live = !isCancelled && Date.now() >= startMs && Date.now() < startMs + minutes * 60000;
  const spotsLeft = session.capacity != null ? Math.max(0, session.capacity - session.registeredCount) : null;
  const description = session.description?.trim();
  const when = whenParts(session.startDateTime, session.timezone);
  const countdown = upcoming && !live ? countdownLabel(session.startDateTime) : null;
  // iOS can't sell paid online sessions (App Store 3.1.1); see useSessionRegistration.
  const purchaseBlocked = !registered && !isCancelled && !isCompleted && isPaidSessionBlocked(session);

  // Bottom bar: what's the one thing to do here?
  const bar = isCancelled
    ? null
    : isCompleted
      ? session.recordingUrl
        ? { label: 'Watch recording', onPress: () => Linking.openURL(session.recordingUrl!) }
        : null
      : registered
        ? { label: live ? 'Join now' : 'Join session', onPress: handleJoin }
        : !user
          ? { label: 'Sign in to register', onPress: handleRegister }
          : spotsLeft === 0 || purchaseBlocked
            ? null
            : { label: price > 0 ? 'Register' : 'Register free', onPress: handleRegister };

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} hue={hue} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: bar ? barSpace : spacing[12] }}>
        <View style={{ paddingHorizontal: GUTTER }}>
          {/* Cover (4:3), kept clean: date and platform live in the facts below */}
          <View style={[styles.banner, { width: bannerW, height: bannerH, backgroundColor: c.card }]}>
            {session.coverImageUrl ? (
              <Image source={{ uri: session.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
                <VideoCamera size={48} color={c.muted} />
              </LinearGradient>
            )}
          </View>

          {live ? (
            <View style={styles.liveRow}>
              <LiveDot color={LIVE_RED} />
              <Text style={[styles.liveText, { color: LIVE_RED }]}>Live now</Text>
            </View>
          ) : null}

          <Text style={[styles.title, { color: c.text }, !live && { marginTop: spacing[6] }]}>{session.title}</Text>

          {session.space ? (
            <Pressable
              onPress={() => router.push(`/space/${session.space!.id}`)}
              style={({ pressed }) => [styles.host, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="link"
            >
              {session.space.logoUrl ? (
                <Image source={{ uri: session.space.logoUrl }} style={[styles.hostLogo, { backgroundColor: c.card }]} />
              ) : (
                <View style={[styles.hostLogo, styles.center, { backgroundColor: c.card }]}>
                  <Text style={[styles.hostInitial, { color: c.muted }]}>{session.space.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[styles.hostText, { color: c.muted }]} numberOfLines={1}>
                by <Text style={{ color: c.text, ...cosmosFont.strong }}>{session.space.name}</Text>
              </Text>
              <CaretRight size={12} color={c.muted} />
            </Pressable>
          ) : null}

          {registered && !isCancelled ? (
            <View style={styles.note}>
              <CheckCircle size={18} color={tokens.success} weight="fill" />
              <Text style={[styles.noteText, { color: tokens.success }]}>
                {isCompleted ? 'You attended this session' : "You're registered. Join opens shortly before the start."}
              </Text>
            </View>
          ) : null}

          {purchaseBlocked ? <Text style={[styles.blockedNote, { color: c.muted }]}>{PAID_SESSION_IOS_NOTE}</Text> : null}

          {/* ── Facts: a ticket-stub date, then length and platform, spots, entry ── */}
          <View style={[styles.facts, { backgroundColor: c.raised }]}>
            <Pressable
              onPress={upcoming ? addToCalendar : undefined}
              disabled={!upcoming}
              accessibilityRole="button"
              accessibilityLabel={`${when.weekday}, ${when.time}${upcoming ? '. Add to calendar' : ''}`}
              style={({ pressed }) => [styles.whenRow, pressed && { backgroundColor: c.tint }]}
            >
              <View style={[styles.stub, { borderColor: c.border }]}>
                <Text style={[styles.stubMonth, { color: c.muted }]}>{when.month}</Text>
                <Text style={[styles.stubDay, { color: c.text }]}>{when.day}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.factTitle, { color: c.text }]} numberOfLines={1}>{when.weekday}</Text>
                <Text style={[styles.factSub, { color: c.soft }]} numberOfLines={1}>{when.time}</Text>
                {countdown ? <Text style={[styles.factSub, { color: c.muted }]}>{countdown}</Text> : null}
              </View>
              {upcoming ? <CalendarPlus size={ICON} color={c.text} /> : null}
            </Pressable>

            <Divider />
            <Fact icon={<Clock size={ICON} color={c.text} />} title={`${minutes} min`} sub={`On ${platform}`} />

            {spotsLeft != null && upcoming ? (
              <>
                <Divider />
                <Fact
                  icon={<UsersThree size={ICON} color={spotsLeft === 0 ? c.danger : c.text} />}
                  title={spotsLeft === 0 ? 'Fully booked' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}
                  danger={spotsLeft === 0}
                />
              </>
            ) : null}

            <Divider />
            {isCancelled ? (
              <Fact
                icon={<XCircle size={ICON} color={c.danger} />}
                title="This session was cancelled"
                sub={session.cancellationReason}
                danger
              />
            ) : isCompleted ? (
              <Fact icon={<Ticket size={ICON} color={c.muted} />} title="This session has ended" />
            ) : (
              <Fact icon={<Ticket size={ICON} color={c.text} />} title={priceLabel} />
            )}
          </View>
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
      </ScrollView>

      {bar ? (
        <ActionBar
          info={registered ? null : { label: 'Price', value: priceLabel }}
          label={bar.label}
          loading={registering || joining}
          // Silver, the cosmos primary, like the event and space pages.
          tone="neutral"
          accent={c.primary}
          onPress={bar.onPress}
          backdropImage={session.coverImageUrl}
          backdropColor={c.bg}
        />
      ) : null}
    </View>
  );
}

function Divider() {
  const c = useCosmos();
  return <View style={[styles.divider, { backgroundColor: c.border }]} />;
}

/** One line of the facts card: bare icon, title, optional quieter line under it. */
function Fact({ icon, title, sub, danger }: { icon: React.ReactNode; title: string; sub?: string | null; danger?: boolean }) {
  const c = useCosmos();
  return (
    <View style={styles.factRow}>
      <View style={styles.factIcon}>{icon}</View>
      <View style={styles.flex}>
        <Text style={[styles.factTitle, { color: danger ? c.danger : c.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.factSub, { color: c.soft }]} numberOfLines={3}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function LiveDot({ color }: { color: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.4 }] }));
  return (
    <View style={styles.liveWrap}>
      <Animated.View style={[styles.liveRing, { backgroundColor: color }, ring]} />
      <View style={[styles.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing[6] },
  liveText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  liveWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  // Michroma runs wide: 24 reads like a 30 in a narrower face.
  title: { marginTop: spacing[2], fontSize: 24, lineHeight: 33, ...cosmosFont.display },
  host: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  hostLogo: { width: 26, height: 26, borderRadius: 7, overflow: 'hidden' },
  hostInitial: { fontSize: 11, ...cosmosFont.display },
  hostText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[4] },
  noteText: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  blockedNote: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  facts: { marginTop: spacing[6], borderRadius: cosmosCardRadius, overflow: 'hidden' },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] },
  stub: { width: STUB, height: STUB, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stubMonth: { fontSize: 11, ...cosmosFont.strong },
  stubDay: { marginTop: 1, fontSize: 20, lineHeight: 24, ...cosmosFont.display },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  // Same column as the date stub, so every line's text starts at one edge.
  factIcon: { width: STUB, alignItems: 'center' },
  factTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  factSub: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing[4] + STUB + spacing[4] },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.6, ...cosmosFont.body },
  link: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  emptyTitle: { marginTop: spacing[4], fontSize: 17, ...cosmosFont.display },
});
