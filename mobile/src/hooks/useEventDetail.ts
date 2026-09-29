import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/AuthContext';
import { shareLink } from '../lib/share';
import { withUtm } from '../services/utm';
import { trackPageView } from '../services/pageViews';
import { googleCalendarUrl, outlookCalendarUrl, icsDownloadUrl } from '../lib/calendar';
import {
  getEventById,
  getEventBySlug,
  Event,
  getMyRegistrationForEvent,
  getMyRegistrationsForEvent,
} from '../lib/api/events';
import { getEventAdditionalInfo, AgendaItem, Speaker, Prize, Faq, Contact } from '../lib/api/additional-info';
import { getMySponsorOptIns, optInToSponsor, withdrawSponsorOptIn } from '../lib/api/sponsors';
import { registerEventInterest } from '../lib/api/leads';
import { getProfile } from '../lib/api/profile';
import { Ticket, formatEventPrice } from '../lib/api/tickets';
import { AppAlert } from '../components/ui/AppAlert';

export const eventUrl = (e: Pick<Event, 'slug' | 'id'>) => `https://www.unifesto.app/event/${e.slug || e.id}`;

export type RegisterMode = 'umbrella' | 'signIn' | 'registered' | 'addTicket' | 'choose' | 'free' | 'paid';

/**
 * Everything the event page needs: the event + tickets + additional-info
 * sections, the user's registration state, and every action on the page.
 */
export function useEventDetail(eventId: string | undefined) {
  const router = useRouter();
  const { user } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  // Ticket-type ids the user already holds. An event can offer several types
  // and a user may register for each distinct type once.
  const [ownedTicketTypeIds, setOwnedTicketTypeIds] = useState<Set<string>>(new Set());

  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);

  // Sponsor lead capture: opted-in eventSponsor ids + ones mid-request.
  const [sponsorOptIns, setSponsorOptIns] = useState<Set<string>>(new Set());
  const [sponsorPending, setSponsorPending] = useState<Set<string>>(new Set());

  // "Notify me" interest capture.
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyName, setNotifyName] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyDone, setNotifyDone] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  /** `silent`: a pull-to-refresh keeps the page on screen while it reloads. */
  const loadEvent = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) {
        // Reset everything when eventId changes so stale data never flashes.
        setLoading(true);
        setEvent(null);
        setTickets([]);
        setAgenda([]);
        setSpeakers([]);
        setPrizes([]);
        setContacts([]);
        setFaqs([]);
        setOwnedTicketTypeIds(new Set());
        setSponsorOptIns(new Set());
        setSponsorPending(new Set());
      }

      const eventData = await getEventBySlug(eventId).catch(() => getEventById(eventId));
      if (!eventData) {
        setEvent(null);
        return;
      }
      setEvent(eventData);
      // Page analytics: one view per open (a pull-to-refresh isn't a new view).
      if (!silent) void trackPageView('event', eventData.slug || eventData.id);

      if (eventData.ticketTypes && eventData.ticketTypes.length > 0) {
        setTickets(
          eventData.ticketTypes.map((tt: any) => ({
            id: tt.id,
            name: tt.name,
            description: tt.description,
            price: parseFloat(tt.price) || 0,
            currency: tt.currency || 'INR',
            quantity_available: tt.totalQuantity - tt.soldCount,
            quantity_sold: tt.soldCount,
            visibility: 'public',
            perUserLimit: tt.perUserLimit,
            // Ids of ticket types whose ownership blocks registering for this one.
            blockedByTicketTypeIds: (tt.blockedBy ?? []).map((b: any) => b.blockerId),
            waitlistEnabled: Boolean(tt.waitlistEnabled),
          })) as any,
        );
      }

      const info = await getEventAdditionalInfo(eventData.id);
      setAgenda(info.agenda);
      setSpeakers(info.speakers);
      setPrizes(info.prizes);
      setContacts(info.contacts);
      setFaqs(info.faqs);

      if (user) {
        const mine = await getMyRegistrationsForEvent(eventData.id);
        setOwnedTicketTypeIds(new Set(mine.map((r: any) => r.ticketTypeId).filter(Boolean)));
        if (eventData.sponsors?.some((s) => s.leadCaptureEnabled)) {
          setSponsorOptIns(new Set(await getMySponsorOptIns(eventData.id)));
        }
      }
    } catch (error) {
      if (__DEV__) console.error('Error loading event:', error);
      // A failed refresh keeps what's on screen.
      if (!silent) setEvent(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, user]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loadEvent({ silent: true });
  }, [loadEvent]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // Re-check registrations on focus (e.g. back from the registration flow).
  useFocusEffect(
    useCallback(() => {
      if (!user || !event) return;
      getMyRegistrationsForEvent(event.id)
        .then((mine) => setOwnedTicketTypeIds(new Set(mine.map((r: any) => r.ticketTypeId).filter(Boolean))))
        .catch((error) => {
          if (__DEV__) console.error('[EventDetail] Error checking registration:', error);
        });
    }, [user, event]),
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  const isFree = tickets.length === 0 || tickets.every((t) => t.price === 0);
  const isOver = event?.status === 'COMPLETED' || event?.status === 'CANCELLED';
  const hasSpots = event?.capacity ? event.capacity > 0 : true;
  const priceDisplay = formatEventPrice(tickets);

  // "Big event" mode: a parent with sub-events. With its own tickets it's a
  // full pass; without, a pure umbrella where registration is per sub-event.
  const subEventCount = event?.childEvents?.length ?? 0;
  const bigEventMode: 'pass' | 'umbrella' | null =
    subEventCount > 0 ? (tickets.length > 0 ? 'pass' : 'umbrella') : null;

  const ownsAnyTicket = ownedTicketTypeIds.size > 0;
  // Registerable = not owned and not blocked by a ticket the user holds.
  const canRegisterMore = tickets.some(
    (t: any) =>
      !ownedTicketTypeIds.has(t.id) &&
      !(t.blockedByTicketTypeIds ?? []).some((id: string) => ownedTicketTypeIds.has(id)),
  );
  const registrationComplete = ownsAnyTicket && !canRegisterMore;

  const registerMode: RegisterMode =
    bigEventMode === 'umbrella'
      ? 'umbrella'
      : !user
        ? 'signIn'
        : registrationComplete
          ? 'registered'
          : ownsAnyTicket
            ? 'addTicket'
            : tickets.length > 1
              ? 'choose'
              : isFree
                ? 'free'
                : 'paid';

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!event) return;
    if (!user) {
      AppAlert.alert('Sign in required', 'Please sign in to register for this event.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
    } else if (registrationComplete) {
      // Owns every ticket type — open the existing ticket instead.
      try {
        const registration = await getMyRegistrationForEvent(event.id);
        if (registration) {
          router.push({
            pathname: '/ticket/[id]',
            params: {
              id: registration.id,
              ticket: JSON.stringify({
                ...(registration.event || event),
                qrCode: registration.qrCode,
                registrationId: registration.id,
                ticketType: registration.ticketType,
                ticketCode: registration.tickets?.[0]?.ticketCode,
                // A seat claimed in someone else's group: read-only ticket
                // (no refund / cancel / manage group — those are the lead's).
                isGroupMember: !!registration.isGroupMember,
              }),
            },
          });
        } else {
          router.push('/tickets');
        }
      } catch {
        router.push('/tickets');
      }
    } else if (!hasSpots && !tickets.some((t: any) => t.waitlistEnabled)) {
      AppAlert.alert('Event full', 'Sorry, this event has reached maximum capacity.');
    } else if (tickets.length === 0) {
      AppAlert.alert('Registration not open', "The organiser hasn't set up any tickets or RSVP options for this event yet.");
    } else {
      router.push({ pathname: '/event-registration', params: { eventId: event.id } });
    }
  };

  const share = useCallback(async () => {
    if (!event) return;
    const when = new Date(event.startDateTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const where = event.venueName || event.city || (event.type === 'ONLINE' ? 'Online' : '');
    const message = `${event.title}\n${[when, where].filter(Boolean).join(' · ')}\n${isFree ? 'Free' : priceDisplay}\n\nRegister on Unifesto`;
    await shareLink({
      message,
      url: withUtm(eventUrl(event), { source: 'unifesto_app', medium: 'share', campaign: 'event_share' }),
      title: event.title,
    });
  }, [event, isFree, priceDisplay]);

  const copyLink = useCallback(async () => {
    if (!event) return;
    try {
      await Clipboard.setStringAsync(
        withUtm(eventUrl(event), { source: 'unifesto_app', medium: 'copy_link', campaign: 'event_share' }),
      );
      AppAlert.alert('Link copied');
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  }, [event]);

  // Google/Outlook deep links + backend .ics, all via Linking (no native module).
  const addToCalendar = useCallback(() => {
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
  }, [event]);

  const openMaps = useCallback(() => {
    if (!event) return;
    const text = [event.venueName, event.venueAddress, event.city, event.state, event.country || 'India']
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');
    // Prefer the venue's name + address (from Google Places when the organiser
    // used "Find the venue"): Google opens the named place. Bare coordinates
    // only showed an unnamed dropped pin, so they're the fallback when there's
    // no venue name to go on.
    const hasCoords = event.latitude != null && event.longitude != null;
    const q = event.venueName?.trim() || !hasCoords ? text : `${event.latitude},${event.longitude}`;
    if (!q) return;
    // Directions to the venue (opens the Google Maps app when installed).
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`).catch(() => {});
  }, [event]);

  const toggleSponsorOptIn = useCallback(
    async (eventSponsorId: string) => {
      if (!event) return;
      if (!user) {
        AppAlert.alert('Sign in required', 'Please sign in to share your details with sponsors.');
        return;
      }
      if (sponsorPending.has(eventSponsorId)) return;
      const alreadyIn = sponsorOptIns.has(eventSponsorId);
      setSponsorPending((prev) => new Set(prev).add(eventSponsorId));
      try {
        if (alreadyIn) {
          if (await withdrawSponsorOptIn(event.id, eventSponsorId)) {
            setSponsorOptIns((prev) => {
              const next = new Set(prev);
              next.delete(eventSponsorId);
              return next;
            });
          }
        } else {
          const res = await optInToSponsor(event.id, eventSponsorId);
          if (res.ok) setSponsorOptIns((prev) => new Set(prev).add(eventSponsorId));
          else AppAlert.alert('Could not share details', res.message ?? 'Please try again.');
        }
      } finally {
        setSponsorPending((prev) => {
          const next = new Set(prev);
          next.delete(eventSponsorId);
          return next;
        });
      }
    },
    [event, user, sponsorOptIns, sponsorPending],
  );

  const openNotify = useCallback(() => {
    setNotifyDone(false);
    setNotifyName(user?.fullName ?? '');
    setNotifyEmail('');
    setNotifyOpen(true);
    // Prefill from the account's email identity so signed-in users rarely type.
    if (user) {
      getProfile()
        .then((p) => {
          if (p?.email) setNotifyEmail((cur) => cur || p.email!);
        })
        .catch(() => {});
    }
  }, [user]);

  const submitNotify = useCallback(async () => {
    if (!event || !notifyEmail.trim()) return;
    setNotifyBusy(true);
    const res = await registerEventInterest(event.id, {
      name: notifyName.trim() || undefined,
      email: notifyEmail.trim(),
    });
    setNotifyBusy(false);
    if (res.ok) setNotifyDone(true);
    else AppAlert.alert('Could not register', res.message ?? 'Please try again.');
  }, [event, notifyName, notifyEmail]);

  return {
    user,
    event,
    tickets,
    loading,
    refreshing,
    refresh,
    agenda,
    speakers,
    prizes,
    contacts,
    faqs,
    isFree,
    isOver,
    priceDisplay,
    subEventCount,
    bigEventMode,
    ownsAnyTicket,
    registerMode,
    handleRegister,
    share,
    copyLink,
    addToCalendar,
    openMaps,
    sponsorOptIns,
    sponsorPending,
    toggleSponsorOptIn,
    notify: {
      open: notifyOpen,
      setOpen: setNotifyOpen,
      name: notifyName,
      setName: setNotifyName,
      email: notifyEmail,
      setEmail: setNotifyEmail,
      busy: notifyBusy,
      done: notifyDone,
      openSheet: openNotify,
      submit: submitNotify,
    },
  };
}

export type EventDetail = ReturnType<typeof useEventDetail>;
