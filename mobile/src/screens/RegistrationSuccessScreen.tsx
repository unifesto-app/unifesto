import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { CalendarPlus, CaretRight, CheckCircle, PaperPlaneTilt } from '@unifesto/unicon/react-native';
import BrandGlow from '../components/ui/BrandGlow';
import { ActionBar, useActionBarSpace } from '../components/event/EventOverlays';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { SheetTop, GUTTER } from '../components/registration/FlowHeader';
import { money } from '../components/registration/Steps';
import { getEventById, getMyRegistrationForEvent } from '../lib/api/events';
import { googleCalendarUrl, icsDownloadUrl, outlookCalendarUrl } from '../lib/calendar';
import { relativeWhen } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import { markTicketsStale } from '../lib/ticketsRefresh';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** Terminal step after registering: confirmation, the pass, next actions. */
export default function RegistrationSuccessScreen() {
  const c = useCosmos();
  const router = useRouter();
  const barSpace = useActionBarSpace();
  const params = useLocalSearchParams();
  const eventId = str(params.eventId);
  const ticketName = str(params.ticketName);
  const quantity = parseInt(str(params.quantity, '1'), 10) || 1;
  const total = parseFloat(str(params.total, '0')) || 0;
  const currency = str(params.currency, '₹');
  // Group seats left OPEN for invite-later; > 0 nudges the lead to invite.
  const openSeats = parseInt(str(params.openSeats, '0'), 10) || 0;

  const [event, setEvent] = useState<any>(null);
  const [registration, setRegistration] = useState<any>(null);
  const [loaded, setLoaded] = useState(!eventId);

  // A new ticket: the Tickets list and the home-screen widgets pick it up.
  useEffect(() => {
    markTicketsStale();
  }, []);

  useEffect(() => {
    if (!eventId) return;
    Promise.all([getEventById(eventId).catch(() => null), getMyRegistrationForEvent(eventId).catch(() => null)])
      .then(([e, reg]) => {
        setEvent(e);
        setRegistration(reg);
      })
      .finally(() => setLoaded(true));
  }, [eventId]);

  // Terminal screen: hardware back does nothing.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  // Check pops in, then the text rises.
  const pop = useSharedValue(0);
  const rise = useSharedValue(0);
  useEffect(() => {
    pop.value = withSpring(1, { damping: 11, stiffness: 180 });
    rise.value = withDelay(180, withTiming(1, { duration: 420 }));
  }, [pop, rise]);
  const popStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.4 + pop.value * 0.6 }] }));
  const riseStyle = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: (1 - rise.value) * 14 }] }));

  const title = event?.title || str(params.eventTitle) || 'your event';
  const where = event?.venueName || event?.city;
  const ticketLine = quantity > 1 ? `${ticketName} · ${quantity} people` : ticketName;

  const viewTicket = () => {
    if (!registration) {
      router.replace('/tickets');
      return;
    }
    router.replace({
      pathname: '/ticket/[id]',
      params: {
        id: registration.id,
        ticket: JSON.stringify({
          ...(registration.event || event),
          qrCode: registration.qrCode,
          registrationId: registration.id,
          ticketType: registration.ticketType,
          ticketCode: registration.tickets?.[0]?.ticketCode,
        }),
      },
    });
  };

  const addToCalendar = () => {
    if (!event) return;
    const cal = {
      slug: event.slug,
      title: event.title,
      startIso: event.startDateTime,
      endIso: event.endDateTime,
      description: event.description,
      location: event.type === 'ONLINE' ? event.onlineUrl : event.venueAddress || event.venueName || event.city,
    };
    AppAlert.alert('Add to calendar', event.title, [
      { text: 'Google Calendar', onPress: () => Linking.openURL(googleCalendarUrl(cal)) },
      { text: 'Outlook', onPress: () => Linking.openURL(outlookCalendarUrl(cal)) },
      { text: 'Apple / Download (.ics)', onPress: () => Linking.openURL(icsDownloadUrl(event.slug)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <BrandGlow />
      <SheetTop fill>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: spacing[10], paddingBottom: barSpace }]} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.center, popStyle]}>
          <CheckCircle size={84} color={c.success} weight="duotone" />
        </Animated.View>

        <Animated.View style={riseStyle}>
          <Text style={[styles.title, { color: c.text }]}>You're going</Text>
          <Text style={[styles.sub, { color: c.soft }]}>
            Your spot at {title} is confirmed.
          </Text>

          {/* The pass */}
          <View style={[styles.pass]}>
            <CardBackdrop shape={styles.pass} />
            <View style={styles.passTop}>
              <View style={[styles.cover, { backgroundColor: c.card }]}>
                {event?.coverImageUrl ? (
                  <Image source={{ uri: event.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.passTitle, { color: c.text }]} numberOfLines={2}>{title}</Text>
                {event?.startDateTime ? (
                  <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>
                    {[relativeWhen(event.startDateTime), where].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.perforation}>
              <View style={[styles.notch, styles.notchLeft, { backgroundColor: c.bg }]} />
              <View style={[styles.dash, { borderColor: c.border }]} />
              <View style={[styles.notch, styles.notchRight, { backgroundColor: c.bg }]} />
            </View>
            <View style={styles.passRows}>
              {ticketName ? (
                <View style={styles.passRow}>
                  <Text style={[styles.meta, { color: c.muted }]}>Ticket</Text>
                  <Text style={[styles.passValue, { color: c.text }]} numberOfLines={1}>{ticketLine}</Text>
                </View>
              ) : null}
              <View style={styles.passRow}>
                <Text style={[styles.meta, { color: c.muted }]}>{total === 0 ? 'Price' : 'Paid'}</Text>
                <Text style={[styles.passValue, { color: c.text }]}>{total === 0 ? 'Free' : money(currency, total)}</Text>
              </View>
            </View>
          </View>

          {openSeats > 0 && registration?.id ? (
            <Pressable
              onPress={() => router.push(`/group/${registration.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.invite, { opacity: pressed ? 0.85 : 1 }]}
            >
              <PaperPlaneTilt size={28} color={c.primary} weight="duotone" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.passValue, { color: c.text, textAlign: 'left' }]}>Invite your team</Text>
                <Text style={[styles.meta, { color: c.soft }]}>
                  {openSeats} seat{openSeats === 1 ? ' is' : 's are'} waiting for someone
                </Text>
              </View>
              <CaretRight size={16} color={c.muted} weight="bold" />
            </Pressable>
          ) : null}

          {event ? (
            <SettingsGroup>
              <SettingsRow icon={<CalendarPlus size={24} color={c.primary} weight="duotone" />} label="Add to calendar" onPress={addToCalendar} />
            </SettingsGroup>
          ) : null}

          <Text style={[styles.explore, { color: c.soft }]} onPress={() => router.replace('/(tabs)')} accessibilityRole="link">
            Explore more events
          </Text>
        </Animated.View>
      </ScrollView>
      </SheetTop>

      <ActionBar info={null} label="View my ticket" loading={!loaded} accent={c.primary} onPress={viewTicket} />
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  content: { paddingHorizontal: GUTTER },
  title: {
    marginTop: spacing[5],
    textAlign: 'center',
    fontSize: typography.fontSize['3xl'],
    
    ...cosmosFont.display,
  },
  sub: {
    marginTop: spacing[2],
    textAlign: 'center',
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.5,
    paddingHorizontal: spacing[4],
    ...cosmosFont.body,
  },
  pass: { marginTop: spacing[8], borderRadius: borderRadius.xl, overflow: 'hidden' },
  passTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[5] },
  cover: { width: 88, height: 66, borderRadius: borderRadius.md, overflow: 'hidden' },
  passTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, marginBottom: 4, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  perforation: { height: NOTCH, justifyContent: 'center' },
  notch: { position: 'absolute', width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  dash: { marginHorizontal: spacing[5], borderTopWidth: 1, borderStyle: 'dashed' },
  passRows: { padding: spacing[5], paddingTop: spacing[3], gap: spacing[3] },
  passRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[4] },
  passValue: { flexShrink: 1, textAlign: 'right', fontSize: typography.fontSize.base, ...cosmosFont.strong },
  invite: {
    marginTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[5],
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(52,145,255,0.14)',
  },
  explore: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
