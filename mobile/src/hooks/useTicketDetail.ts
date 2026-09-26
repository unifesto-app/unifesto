import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { getEventBySlug } from '../lib/api/events';
import { getRegistrationCheckins, type RegistrationCheckinRecord } from '../lib/api/checkin';
import { markTicketsStale } from '../lib/ticketsRefresh';
import {
  cancelMyRegistration,
  getMyGroupMembers,
  getRegistrationWhatsappGroup,
  setWhatsappGroupJoined,
  type MyGroupRoster,
  type TicketWhatsappGroup,
} from '../lib/api/registrations';
import { googleCalendarUrl, icsDownloadUrl, outlookCalendarUrl, type CalendarEvent } from '../lib/calendar';
import { AppAlert } from '../components/ui/AppAlert';
import { getParticipantView } from '../lib/api/leaderboard';
import { journeyFor, standingOf } from '../lib/competition';

export type TicketStatus = 'registered' | 'checkedIn' | 'cancelled';

/** Reasons the system writes itself; they say nothing new, so they aren't shown. */
const SYSTEM_REASONS = new Set(['Cancelled by attendee', 'Superseded by a new registration attempt']);

/**
 * What to tell the attendee about a cancellation: who did it (when known) and
 * the organiser's reason. A typed reason can't be told apart from the
 * attendee's own, so it is shown as "Reason".
 */
export function describeCancellation(reason?: string | null): { byOrganiser: boolean; reason?: string } {
  const r = reason?.trim();
  if (!r || SYSTEM_REASONS.has(r)) return { byOrganiser: false };
  if (r === 'Cancelled by the organiser') return { byOrganiser: true };
  return { byOrganiser: false, reason: r };
}

/**
 * Everything the ticket page needs from the (snapshot) ticket param plus the
 * live bits fetched per registration: check-in history, group roster,
 * WhatsApp group, and the event fields the snapshot often lacks (cover,
 * space logo, white-label colour, completion). All hooks run unconditionally.
 */
export function useTicketDetail(ticketParam: unknown) {
  // The ticket arrives as a JSON route param (a snapshot from the list).
  const ticket: any = useMemo(() => {
    if (typeof ticketParam !== 'string') return ticketParam ?? null;
    try {
      return JSON.parse(ticketParam);
    } catch {
      return null;
    }
  }, [ticketParam]);

  const registrationId: string | undefined = ticket?.registrationId || ticket?.id;

  // Event fields the caller may not have passed. `undefined` = unresolved.
  const [cover, setCover] = useState<string | undefined>(
    ticket?.coverImageUrl || ticket?.event?.coverImageUrl || ticket?.cover_image_url || ticket?.banner_url,
  );
  const [spaceLogo, setSpaceLogo] = useState<string | undefined>(
    ticket?.space?.logoUrl || ticket?.event?.space?.logoUrl || ticket?.spaceLogoUrl,
  );
  const [brandColor, setBrandColor] = useState<string | null | undefined>(
    ticket?.event?.branding?.color ?? ticket?.branding?.color ?? undefined,
  );
  const [eventCompleted, setEventCompleted] = useState<boolean | undefined>(() => {
    const s = ticket?.event?.status ?? ticket?.eventStatus;
    return s ? s === 'COMPLETED' : undefined;
  });
  const eventSlug: string | undefined = ticket?.slug || ticket?.event?.slug || ticket?.eventSlug;

  const [eventId, setEventId] = useState<string | undefined>(ticket?.eventId ?? ticket?.event?.id ?? undefined);
  // Hackathon / competition board for this event, if the organiser runs one.
  const [competition, setCompetition] = useState<{ status: string } | null>(null);
  const [checkins, setCheckins] = useState<RegistrationCheckinRecord[]>([]);
  const [roster, setRoster] = useState<MyGroupRoster | null>(null);
  const [waGroup, setWaGroup] = useState<TicketWhatsappGroup | null>(null);
  const [waSaving, setWaSaving] = useState(false);
  const [cancelledNow, setCancelledNow] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // One event fetch fills whatever the snapshot is missing.
  useEffect(() => {
    if (cover && spaceLogo && brandColor !== undefined && eventCompleted !== undefined && eventId) return;
    const key = eventSlug || ticket?.eventId || ticket?.event?.id || ticket?.id;
    if (!key) return;
    getEventBySlug(key)
      .then((e: any) => {
        if (e?.coverImageUrl) setCover((c) => c || e.coverImageUrl);
        if (e?.space?.logoUrl) setSpaceLogo((l) => l || e.space.logoUrl);
        setBrandColor((b) => (b !== undefined ? b : e?.branding?.color ?? null));
        if (e?.status) setEventCompleted(e.status === 'COMPLETED');
        if (e?.id) setEventId((id) => id || e.id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!registrationId) return;
    getRegistrationCheckins(registrationId).then(setCheckins).catch(() => {});
    getMyGroupMembers(registrationId).then(setRoster).catch(() => {});
    getRegistrationWhatsappGroup(registrationId).then(setWaGroup).catch(() => {});
  }, [registrationId]);

  useEffect(() => {
    if (!eventId) return;
    getParticipantView(eventId).then((res) => {
      if (!res.ok || !res.data) return;
      const mine = res.data.myEntrantIds[0];
      const s = mine ? standingOf(journeyFor(res.data, mine)) : null;
      const status = !s
        ? res.data.awards.length ? 'Winners announced' : ''
        : s.kind === 'in' ? 'Advanced' : s.kind === 'out' ? 'Out' : 'Awaiting results';
      setCompetition({ status });
    });
  }, [eventId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const raw = cancelledNow
    ? 'CANCELLED'
    : String(ticket?.registrationStatus ?? ticket?.status ?? 'REGISTERED').toUpperCase();
  const status: TicketStatus =
    raw === 'CANCELLED'
      ? 'cancelled'
      : raw === 'ATTENDED' || raw === 'CHECKED_IN' || ticket?.checkedInAt
        ? 'checkedIn'
        : 'registered';

  const title: string = ticket?.title || ticket?.event?.title || ticket?.eventTitle || 'Event';
  const startIso: string | undefined = ticket?.startDateTime || ticket?.event?.startDateTime;
  const endIso: string | undefined = ticket?.endDateTime || ticket?.event?.endDateTime;
  const isOnline = ticket?.type === 'ONLINE';
  const venue: string = ticket?.venueName || ticket?.city || (isOnline ? 'Online' : 'Venue TBA');
  const ticketTypeName: string | undefined =
    typeof ticket?.ticketType === 'string' ? ticket.ticketType : ticket?.ticketType?.name;
  const listPrice = ticket?.ticketType?.price != null ? Number(ticket.ticketType.price) : NaN;
  // Prefer what was actually charged (covers ₹0-after-coupon), else list price.
  const amountCharged = ticket?.totalAmount != null ? Number(ticket.totalAmount) : listPrice;
  const isFree = amountCharged === 0;
  const qrValue: string = ticket?.qrCode || ticket?.id || registrationId || 'UNIFESTO';
  const code: string =
    ticket?.ticketCode || (typeof registrationId === 'string' ? registrationId.slice(0, 8).toUpperCase() : '');

  const isGroupMember = !!ticket?.isGroupMember;
  const cancelled = status === 'cancelled';
  const canManageGroup = !!roster?.editable && !!registrationId && !isGroupMember && !eventCompleted;
  const canRefund = !!registrationId && !cancelled && !isFree && !isGroupMember;
  const canCancelFree = !!registrationId && !cancelled && isFree && !eventCompleted && !isGroupMember;

  // Single registration-level check-in, used only if the history is empty.
  const fallbackCheckin =
    checkins.length === 0 && status === 'checkedIn' && ticket?.checkedInAt
      ? {
          id: 'fallback',
          checkinType: ticket?.checkInType || ticket?.checkinType || 'Check-in',
          checkedInAt: ticket.checkedInAt as string,
          checkedBy: ticket?.checkedInBy || ticket?.checkedInByName || null,
        }
      : null;

  // ── Actions ───────────────────────────────────────────────────────────────
  const addToCalendar = useCallback(() => {
    if (!startIso || !eventSlug) return;
    const cal: CalendarEvent = {
      slug: eventSlug,
      title,
      startIso,
      endIso: endIso || startIso,
      description: ticket?.description ?? null,
      location: isOnline ? ticket?.onlineUrl ?? null : ticket?.venueAddress || ticket?.venueName || ticket?.city || null,
    };
    AppAlert.alert('Add to calendar', title, [
      { text: 'Google Calendar', onPress: () => Linking.openURL(googleCalendarUrl(cal)) },
      { text: 'Outlook', onPress: () => Linking.openURL(outlookCalendarUrl(cal)) },
      { text: 'Apple / Download (.ics)', onPress: () => Linking.openURL(icsDownloadUrl(eventSlug)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [startIso, endIso, eventSlug, title, isOnline, ticket]);

  const toggleJoinedWhatsapp = async () => {
    if (!waGroup?.registrationId || waSaving) return;
    const next = !waGroup.joined;
    setWaSaving(true);
    try {
      await setWhatsappGroupJoined(waGroup.registrationId, next);
      setWaGroup((g) => (g ? { ...g, joined: next } : g));
    } catch {
      // Convenience toggle; leave as-is on failure.
    }
    setWaSaving(false);
  };

  const openWhatsapp = () => {
    if (waGroup?.inviteUrl) Linking.openURL(waGroup.inviteUrl).catch(() => {});
  };

  const confirmCancel = () => {
    if (!registrationId || cancelling) return;
    AppAlert.alert('Cancel ticket?', `Your spot for ${title} will be released. This can't be undone.`, [
      { text: 'Keep ticket', style: 'cancel' },
      {
        text: 'Cancel ticket',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelMyRegistration(registrationId);
            setCancelledNow(true);
            markTicketsStale();
          } catch (e: any) {
            AppAlert.alert('Could not cancel', e?.message || 'Please try again.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const cancelledAt: string | undefined = ticket?.cancelledAt ?? undefined;
  const cancellation = describeCancellation(ticket?.cancellationReason);

  return {
    ticket,
    eventId,
    competition,
    registrationId,
    cancelledAt,
    cancellation,
    title,
    startIso,
    venue,
    isOnline,
    ticketTypeName,
    listPrice,
    cover,
    spaceLogo,
    brandColor: brandColor || null,
    eventSlug,
    eventCompleted: !!eventCompleted,
    status,
    qrValue,
    code,
    checkins: fallbackCheckin ? [fallbackCheckin] : checkins,
    roster,
    waGroup,
    waSaving,
    canManageGroup,
    canRefund,
    canCancelFree,
    cancelling,
    addToCalendar,
    toggleJoinedWhatsapp,
    openWhatsapp,
    confirmCancel,
  };
}
