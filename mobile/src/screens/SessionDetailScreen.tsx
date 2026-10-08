import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CalendarBlank, CaretRight, CheckCircle, Clock, Ticket, UsersThree, VideoCamera, XCircle } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isPaidSessionBlocked, PAID_SESSION_IOS_NOTE, useSessionRegistration } from '../hooks/useSessionRegistration';
import useTopSpacing from '../hooks/useTopSpacing';
import Skeleton from '../components/Skeleton';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { ActionBar } from '../components/event/EventOverlays';
import { HeaderActions, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { googleCalendarUrl, outlookCalendarUrl } from '../lib/calendar';
import { formatTime } from '../utils/eventFormat';
import { getSessionBySlug, getMySessions, joinSession, PLATFORM_LABELS, type Session } from '../lib/api/sessions';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';

const GUTTER = spacing[6];

/** "Sat, 12 Oct · 6:30 PM", in the session's own time zone. */
function formatWhen(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

/**
 * Online session page — mirrors event details: inset 4:3 cover, title and
 * host, a facts card, about, and the shared bottom action bar (sign in /
 * register / join / watch recording).
 */
export default function SessionDetailScreen({ slug }: { slug: string }) {
  const tokens = useTokens();
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const { width } = useWindowDimensions();
  const { register, loading: registering } = useSessionRegistration();

  const [session, setSession] = useState<Session | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const bannerW = width - GUTTER * 2;
  const bannerH = Math.round((bannerW * 3) / 4);

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
      <View style={[styles.flex, { backgroundColor: tokens.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <Skeleton width={bannerW} height={bannerH} borderRadius={borderRadius.xl} />
        <Skeleton width="80%" height={28} borderRadius={8} style={{ marginTop: spacing[5] }} />
        <Skeleton width="100%" height={168} borderRadius={borderRadius.xl} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: tokens.bg }]}>
        <VideoCamera size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>Session not found</Text>
        <Text style={[styles.link, { color: tokens.accent }]} onPress={() => router.back()}>Go back</Text>
      </View>
    );
  }

  const price = Number(session.price);
  const priceLabel = price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free';
  const isCancelled = session.status === 'CANCELLED';
  const isCompleted = session.status === 'COMPLETED';
  const platform = session.platform === 'OTHER' ? session.platformOther || 'Online' : PLATFORM_LABELS[session.platform];
  const startMs = new Date(session.startDateTime).getTime();
  const live = !isCancelled && Date.now() >= startMs && Date.now() < startMs + (session.durationMinutes || 60) * 60000;
  const spotsLeft = session.capacity != null ? Math.max(0, session.capacity - session.registeredCount) : null;
  const description = session.description?.trim();
  // iOS can't sell paid online sessions (App Store 3.1.1); see useSessionRegistration.
  const purchaseBlocked = !registered && !isCancelled && !isCompleted && isPaidSessionBlocked(session);

  // Bottom bar: what's the one thing to do here?
  const bar = isCancelled
    ? null
    : isCompleted
      ? session.recordingUrl
        ? { label: 'Watch recording', onPress: () => Linking.openURL(session.recordingUrl!), neutral: false }
        : null
      : registered
        ? { label: live ? 'Join now' : 'Join session', onPress: handleJoin, neutral: false }
        : !user
          ? { label: 'Sign in to register', onPress: handleRegister, neutral: false }
          : spotsLeft === 0 || purchaseBlocked
            ? null
            : { label: price > 0 ? 'Register' : 'Register free', onPress: handleRegister, neutral: false };

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 150 }}>
        {/* Cover (4:3), kept clean: date and platform live in the facts below */}
        <View style={[styles.banner, { width: bannerW, height: bannerH, backgroundColor: tokens.elevated }]}>
          {session.coverImageUrl ? (
            <Image source={{ uri: session.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
              <VideoCamera size={48} color="#ffffff" weight="fill" />
            </LinearGradient>
          )}
        </View>

        <Text style={[styles.title, { color: tokens.text }]}>{session.title}</Text>

        {live ? (
          <View style={styles.liveRow}>
            <LiveDot color="#ef4444" />
            <Text style={[styles.liveText, { color: '#ef4444' }]}>Live now</Text>
          </View>
        ) : null}

        {session.space ? (
          <Pressable onPress={() => router.push(`/space/${session.space!.id}`)} style={styles.host} accessibilityRole="link">
            {session.space.logoUrl ? (
              <Image source={{ uri: session.space.logoUrl }} style={[styles.hostLogo, { backgroundColor: tokens.elevated }]} />
            ) : (
              <View style={[styles.hostLogo, styles.center, { backgroundColor: tokens.elevated }]}>
                <Text style={{ color: tokens.textSecondary, ...font('heading') }}>{session.space.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={[styles.hostText, { color: tokens.textSecondary }]} numberOfLines={1}>
              by <Text style={{ color: tokens.text, ...font('semibold') }}>{session.space.name}</Text>
            </Text>
            <CaretRight size={12} color={tokens.textMuted} weight="bold" />
          </Pressable>
        ) : null}

        {registered && !isCancelled ? (
          <View style={styles.registered}>
            <CheckCircle size={18} color={tokens.success} weight="fill" />
            <Text style={[styles.registeredText, { color: tokens.success }]}>
              {isCompleted ? 'You attended this session' : "You're registered. Join opens shortly before the start."}
            </Text>
          </View>
        ) : null}

        {purchaseBlocked ? (
          <Text style={[styles.blockedNote, { color: tokens.textMuted }]}>{PAID_SESSION_IOS_NOTE}</Text>
        ) : null}

        {isCancelled ? (
          <View style={[styles.cancelled, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
            <XCircle size={22} color={tokens.danger} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cancelledTitle, { color: tokens.danger }]}>This session was cancelled</Text>
              {session.cancellationReason ? (
                <Text style={[styles.body, { color: tokens.textSecondary }]}>{session.cancellationReason}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <SettingsGroup>
          <SettingsRow
            icon={<CalendarBlank size={24} color={tokens.accent} weight="duotone" />}
            label={formatWhen(session.startDateTime, session.timezone)}
            onPress={upcoming ? addToCalendar : undefined}
          />
          <SettingsRow
            icon={<Clock size={24} color={tokens.accent} weight="duotone" />}
            label={`${session.durationMinutes || 60} min on ${platform}`}
          />
          {spotsLeft != null && upcoming ? (
            <SettingsRow
              icon={<UsersThree size={24} color={spotsLeft === 0 ? tokens.danger : tokens.accent} weight="duotone" />}
              label={spotsLeft === 0 ? 'Fully booked' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}
            />
          ) : null}
          <SettingsRow icon={<Ticket size={24} color={tokens.accent} weight="duotone" />} label={priceLabel} />
        </SettingsGroup>

        {description ? (
          <View style={{ marginTop: spacing[8] }}>
            <Text style={[styles.blockTitle, { color: tokens.text }]}>About</Text>
            <Text style={[styles.body, { color: tokens.textSecondary, fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.55 }]} numberOfLines={descExpanded ? undefined : 6}>
              {description}
            </Text>
            {description.length > 240 ? (
              <Text style={[styles.link, { color: tokens.accent }]} onPress={() => setDescExpanded((v) => !v)}>
                {descExpanded ? 'Show less' : 'Read more'}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {bar ? (
        <ActionBar
          info={registered ? null : { label: 'Price', value: priceLabel }}
          label={bar.label}
          loading={registering || joining}
          accent={tokens.accent}
          onPress={bar.onPress}
        />
      ) : null}
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
  banner: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing[2] },
  liveText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  liveWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  title: {
    marginTop: spacing[5],
    fontSize: typography.fontSize['3xl'],
    lineHeight: typography.fontSize['3xl'] * 1.15,
    letterSpacing: -0.5,
    ...font('heading'),
  },
  host: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  hostLogo: { width: 26, height: 26, borderRadius: 7, overflow: 'hidden' },
  hostText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...font() },
  registered: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[4] },
  blockedNote: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...font('medium') },
  registeredText: { flex: 1, fontSize: typography.fontSize.sm, ...font('semibold') },
  cancelled: { flexDirection: 'row', gap: spacing[3], padding: spacing[4], borderRadius: borderRadius.xl, marginTop: spacing[5] },
  cancelledTitle: { fontSize: typography.fontSize.base, marginBottom: 2, ...font('semibold') },
  blockTitle: { fontSize: typography.fontSize.lg, marginBottom: spacing[2], ...font('heading') },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  link: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, ...font('heading') },
});
