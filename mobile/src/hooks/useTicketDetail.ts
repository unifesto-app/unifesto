import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { getEventBySlug, getMyRegistrationsForEvent } from '../lib/api/events';
import { getMyDetails, type MyDetails } from '../lib/api/attendeeControls';
import { getRegistrationCheckins, type RegistrationCheckinRecord } from '../lib/api/checkin';
import { markTicketsStale } from '../lib/ticketsRefresh';
import { isEventOver } from '../lib/upcomingTickets';
import {
  cancelMyRegistration,
  deleteMyTicket,
  getMyGroupMembers,
  getRegistrationWhatsappGroup,
  setWhatsappGroupJoined,
  type MyGroupRoster,
  type TicketWhatsappGroup,
} from '../lib/api/registrations';
import { googleCalendarUrl, icsDownloadUrl, outlookCalendarUrl, type CalendarEvent } from '../lib/calendar';
import { AppAlert } from '../components/ui/AppAlert';
import { getParticipantView } from '../lib/api/leaderboard';
import { getMyHackathon } from '../lib/api/hackathon';
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
  // In hackathon mode the team hub replaces the competition row.
  const [hackathon, setHackathon] = useState<{ teamCode: string | null; cancelled: boolean } | null>(null);
  const [checkins, setCheckins] = useState<RegistrationCheckinRecord[]>([]);
  const [roster, setRoster] = useState<MyGroupRoster | null>(null);
  const [waGroup, setWaGroup] = useState<TicketWhatsappGroup | null>(null);
  // Whether the organiser currently lets this person change their registration details.
  const [details, setDetails] = useState<MyDetails | null>(null);
  const [waSaving, setWaSaving] = useState(false);
  const [cancelledNow, setCancelledNow] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Pull-to-refresh: bumping the key re-runs every fetch below; the live
  // status replaces the (possibly stale) snapshot the list passed in.
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{ status: string; checkedInAt: string | null } | null>(null);

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
    const jobs = [
      getRegistrationCheckins(registrationId).then(setCheckins),
      getMyGroupMembers(registrationId).then(setRoster),
      getRegistrationWhatsappGroup(registrationId).then(setWaGroup),
      getMyDetails(registrationId).then((res) => setDetails(res.ok ? res.data : null)),
    ];
    if (reloadKey > 0 && eventId) {
      jobs.push(
        getMyRegistrationsForEvent(eventId).then((regs: any[]) => {
          const mine = regs.find((r) => r.id === registrationId);
          if (mine) setLiveStatus({ status: String(mine.status), checkedInAt: mine.checkedInAt ?? null });
        }),
      );
    }
    void Promise.allSettled(jobs).then(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId, reloadKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  }, []);

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
    getMyHackathon(eventId).then((res) => {
      const team = res.ok ? res.data?.team : null;
      setHackathon(team ? { teamCode: team.teamCode, cancelled: team.stage === 'CANCELLED' } : null);
    });
  }, [eventId, reloadKey]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const raw = cancelledNow
    ? 'CANCELLED'
    : String(liveStatus?.status ?? ticket?.registrationStatus ?? ticket?.status ?? 'REGISTERED').toUpperCase();
  const status: TicketStatus =
    raw === 'CANCELLED'
      ? 'cancelled'
      : raw === 'ATTENDED' || raw === 'CHECKED_IN' || liveStatus?.checkedInAt || ticket?.checkedInAt
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
  // Leads manage the whole group; teammates open it for their own details.
  const canManageGroup =
    !!registrationId && !eventCompleted && (isGroupMember ? details?.role === 'member' && !cancelled : !!roster?.editable);
  const canRefund = !!registrationId && !cancelled && !isFree && !isGroupMember;
  const canEditDetails = !!details?.editable && !cancelled;
  const editDetailsUntil = details?.editsUntil ?? null;
  const canCancelFree = !!registrationId && !cancelled && isFree && !eventCompleted && !isGroupMember;
  // A finished ticket (event over, or cancelled) can be deleted from my list.
  // Needs the real registration id — `ticket.id` is the event's on list snapshots.
  const canDelete =
    !!ticket?.registrationId &&
    (cancelled || !!eventCompleted || isEventOver({ ...ticket, startDateTime: startIso, endDateTime: endIso }));

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

  /** Confirms, then deletes this finished ticket; `onDone` leaves the screen. */
  const confirmDelete = (onDone: () => void) => {
    if (!canDelete || deleting) return;
    AppAlert.alert('Delete ticket?', `${title} will be removed from your tickets. This can't be undone.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteMyTicket(ticket.registrationId);
            markTicketsStale();
            onDone();
          } catch (e: any) {
            AppAlert.alert('Could not delete', e?.message || 'Please try again.');
          } finally {
            setDeleting(false);
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
    competition: hackathon ? null : competition,
    hackathon,
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
    canEditDetails,
    editDetailsUntil,
    canRefund,
    canCancelFree,
    cancelling,
    addToCalendar,
    toggleJoinedWhatsapp,
    openWhatsapp,
    confirmCancel,
    canDelete,
    confirmDelete,
    refreshing,
    refresh,
  };
}
