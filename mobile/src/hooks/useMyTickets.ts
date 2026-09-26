import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import RazorpayCheckout from 'react-native-razorpay';
import { useAuth } from '../context/AuthContext';
import { consumeTicketsStale } from '../lib/ticketsRefresh';
import { onReconnect } from '../lib/offline/connectivity';
import { getMyRegisteredEvents } from '../lib/api/events';
import {
  getMyMemberTickets,
  getMyWaitlist,
  createWaitlistOfferOrder,
  leaveWaitlist,
  verifyPayment,
  type MyWaitlistEntry,
} from '../lib/api/registrations';
import { AppAlert } from '../components/ui/AppAlert';

export type TicketTab = 'upcoming' | 'past' | 'waitlist' | 'cancelled';

export const ALL_TABS: TicketTab[] = ['upcoming', 'past', 'waitlist', 'cancelled'];
type ListTab = Exclude<TicketTab, 'waitlist'>;

const PAGE_SIZE = 20;

/** A registration flattened onto its event — the shape /ticket/[id] expects. */
export type MyTicket = any;

const flatten = (r: any, extra: Record<string, unknown> = {}) =>
  r.event
    ? {
        ...r.event,
        qrCode: r.qrCode,
        registrationId: r.id,
        registrationStatus: r.status,
        paymentStatus: r.paymentStatus,
        cancelledAt: r.cancelledAt,
        cancellationReason: r.cancellationReason,
        ticketType: r.ticketType,
        ticketCode: r.tickets?.[0]?.ticketCode,
        ...extra,
      }
    : r;

export interface TicketList {
  items: MyTicket[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
}

const emptyList = (): TicketList => ({ items: [], page: 1, hasMore: true, loading: true, loadingMore: false });
const EMPTY_LISTS: Record<ListTab, TicketList> = { upcoming: emptyList(), past: emptyList(), cancelled: emptyList() };

/**
 * Everything the Tickets tab shows: paginated registrations per tab (plus
 * shared group-member tickets), the waiting list, and paying for / turning
 * down a waitlist offer.
 */
export function useMyTickets() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TicketTab>('upcoming');
  // Each list tab keeps its own data so the pager can show a neighbour
  // mid-drag without refetching.
  const [lists, setLists] = useState<Record<ListTab, TicketList>>(EMPTY_LISTS);
  const [waitlist, setWaitlist] = useState<MyWaitlistEntry[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<TicketTab | null>(null);
  // Latest lists for callbacks that outlive a render (loadMore on scroll).
  const listsRef = useRef(lists);
  listsRef.current = lists;

  const patch = (key: ListTab, next: Partial<TicketList>) =>
    setLists((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));

  const loadWaitlist = async () => {
    setWaitlistLoading(true);
    try {
      setWaitlist(await getMyWaitlist());
    } catch {
      setWaitlist([]);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const loadTickets = async (key: ListTab, pageNum: number = 1, reset: boolean = false) => {
    patch(key, reset ? { loading: true } : { loadingMore: true });
    try {
      // Cancelled tickets come from their own server-side scope, so that tab
      // paginates on its own instead of filtering pages of live tickets.
      const isCancelledTab = key === 'cancelled';
      const response = await getMyRegisteredEvents(pageNum, PAGE_SIZE, isCancelledTab ? 'cancelled' : 'active');

      if (!response) {
        patch(key, { ...(reset ? { items: [] } : {}), hasMore: false });
        return;
      }

      const ownEvents = (response?.data || response?.events || []).map((r: any) => flatten(r));

      // On the first page, also include tickets where the user is a group
      // member of someone else's registration (shared ticket, read-only).
      // The backend already leaves cancelled ones out, so skip on Cancelled.
      let memberEvents: any[] = [];
      if (reset && !isCancelledTab) {
        try {
          const memberRes = await getMyMemberTickets();
          memberEvents = (memberRes?.data || []).map((r: any) =>
            flatten(r, { isGroupMember: true, leadName: r.leadName }),
          );
        } catch {}
      }

      const now = new Date();
      const filtered = [...memberEvents, ...ownEvents].filter((event: any) => {
        if (isCancelledTab) return true; // past and future alike
        const upcoming = new Date(event.startDateTime) >= now;
        return key === 'upcoming' ? upcoming : !upcoming;
      });
      // Soonest first for what's coming; most recent first for history.
      filtered.sort((a: any, b: any) => {
        const diff = +new Date(a.startDateTime) - +new Date(b.startDateTime);
        return key === 'upcoming' ? diff : -diff;
      });

      setLists((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          items: reset ? filtered : [...prev[key].items, ...filtered],
          hasMore: ownEvents.length === PAGE_SIZE,
          page: pageNum,
        },
      }));
    } catch {
      patch(key, { ...(reset ? { items: [] } : {}), hasMore: false });
    } finally {
      patch(key, { loading: false, loadingMore: false });
    }
  };

  const reload = (key: TicketTab) => (key === 'waitlist' ? loadWaitlist() : loadTickets(key, 1, true));

  // Pull-to-refresh reloads the tab it was pulled on, from the top.
  const onRefresh = async (key: TicketTab) => {
    setRefreshing(key);
    try {
      await reload(key);
    } finally {
      setRefreshing(null);
    }
  };

  // Load every tab once on sign-in so swiping lands on ready content.
  useEffect(() => {
    if (!user) return;
    ALL_TABS.forEach((key) => reload(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Offline copies are replaced with live data as soon as we reconnect.
  useEffect(() => {
    if (!user) return;
    return onReconnect(() => ALL_TABS.forEach((key) => reload(key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Reload once when returning from a screen that changed a ticket (e.g. a
  // cancel on the ticket detail screen), without refetching on every focus.
  useFocusEffect(
    useCallback(() => {
      if (consumeTicketsStale()) ALL_TABS.forEach((key) => reload(key));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const loadMore = (key: TicketTab) => {
    if (key === 'waitlist') return;
    const l = listsRef.current[key];
    if (!l.loadingMore && l.hasMore && !l.loading) loadTickets(key, l.page + 1, false);
  };

  /**
   * Pays for a spot the organiser has offered.
   *
   * Verification goes through the normal registration verify route: the backend
   * spots that this registration came off the waiting list and converts it in
   * place rather than claiming a second seat.
   */
  const payForOffer = async (entry: MyWaitlistEntry) => {
    if (!entry.offer) return;
    setPayingId(entry.registrationId);
    try {
      const order = await createWaitlistOfferOrder(entry.registrationId);
      const paymentData: any = await RazorpayCheckout.open({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Unifesto',
        description: entry.event.title,
        image: entry.event.coverImageUrl || 'https://unifesto.app/logo.png',
        prefill: {
          name: user?.fullName || '',
          email: '',
          contact: user?.mobileNumber || '',
        },
        theme: { color: '#3491ff' },
      });

      await verifyPayment(entry.event.id, {
        registrationId: entry.registrationId,
        razorpayOrderId: paymentData.razorpay_order_id,
        razorpayPaymentId: paymentData.razorpay_payment_id,
        razorpaySignature: paymentData.razorpay_signature,
      });

      AppAlert.alert('Spot confirmed', `You're in for ${entry.event.title}. Your ticket is under Upcoming.`);
      loadTickets('upcoming', 1, true);
      setTab('upcoming');
    } catch (err: any) {
      // Razorpay reports a user-cancelled sheet as an error; that is not a
      // failure worth alarming anyone about. The seat stays held, so they can
      // simply try again.
      const cancelled = err?.code === 0 || err?.description === 'Payment Cancelled';
      if (!cancelled) {
        AppAlert.alert('Payment failed', err?.message || err?.description || 'Please try again');
      }
      await loadWaitlist();
    } finally {
      setPayingId(null);
    }
  };

  const confirmLeave = (entry: MyWaitlistEntry) => {
    const offered = entry.waitlistStatus === 'OFFERED';
    AppAlert.alert(
      offered ? 'Turn down this spot?' : 'Leave the waiting list?',
      offered
        ? 'The seat goes back to the organiser and you lose your place in the queue.'
        : 'You lose your place in the queue and would have to join again at the back.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: offered ? 'Turn down' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveWaitlist(entry.registrationId);
            } catch (err: any) {
              AppAlert.alert('Could not do that', err?.message || 'Please try again');
            }
            await loadWaitlist();
          },
        },
      ],
    );
  };

  return {
    user,
    tab,
    setTab,
    lists,
    waitlist,
    waitlistLoading,
    refreshing,
    onRefresh,
    loadMore,
    payingId,
    payForOffer,
    confirmLeave,
  };
}
