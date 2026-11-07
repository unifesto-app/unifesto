import type { EmailService } from '../email/email.service';
import type * as T from '../email/templates';
import type { DeliveryOpts } from './message-delivery';
import type { NotificationCategory } from './notifications.constants';
import { button, esc, h1, note, p, SPACE_APP } from '../email/layout';

/**
 * The notify() kind registry (C2). Each kind says which push category it
 * belongs to, how critical it is (see channelsFor in notify.policy.ts), and how
 * it renders on each channel. Email delegates to the existing EmailService
 * methods: no template lives here.
 *
 * Adding a kind: add its data shape to NotifyKindData, then an entry to
 * NOTIFY_KINDS. TypeScript makes the two agree.
 */

export type Criticality = 'critical' | 'normal' | 'low';

export interface PushCopy {
  title: string;
  body: string;
  deepLink?: string;
  data?: Record<string, unknown>;
}

/** Template data minus what notify() fills in itself (the address, the brand). */
type MailData<D> = Omit<D, 'email' | 'brand'>;

/** What each kind's caller passes to notify(). */
export interface NotifyKindData {
  'payment.confirmed': MailData<T.PaymentConfirmationData> & { eventId: string; eventSlug?: string };
  /** Seat held, payment needed to claim it. */
  'waitlist.offer': MailData<T.WaitlistPromotedData> & { entryId: string; eventId: string; eventSlug?: string };
  'event.cancelled': MailData<T.EventCancelledData> & { eventId: string };
  /**
   * Critical: a time or venue change must reach everyone by email. Not deduped
   * by default (an event can change twice); pass opts.dedupKey per change.
   */
  'event.updated': MailData<T.EventUpdatedData> & { eventId: string; eventSlug?: string };
  /** approvedAt keys the dedup per approval, so approve, reject, approve tells them again. */
  'space.approved': MailData<T.SpaceApprovedData> & { spaceId: string; approvedAt: Date };
  /**
   * Not deduped by default (a resubmitted space can be rejected again). A
   * rejected space request (Q19) has no space yet, only the request.
   */
  'space.rejected': MailData<T.SpaceRejectedData> & ({ spaceId: string } | { requestId: string });
  /**
   * Q39: to the owner when Platform or the system moved the space's status
   * (an owner's own pause or archive sends nothing). One per change.
   */
  'space.status': SpaceStatusNotice & { status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED'; reason?: string | null; changedAt: Date; bySystem?: boolean };
  /** Q39: an abandoned space is archived in 14 days unless it hosts an event. */
  'space.archive_warning': SpaceStatusNotice & { archiveOnText: string };
  /** Q38: to the owner and Space Admins when a space turns Quiet. One per Quiet spell. */
  'space.quiet': SpaceStatusNotice & { nudgedAt: Date };
  /** To each Space Admin: a note from the public space page. One per lead. */
  'space.inquiry': MailData<T.SpaceInquiryData> & { spaceId: string; leadId: string };
  /** F2: to checked-in attendees 2 h after the event ends. Push + inbox only. */
  'feedback.request': FeedbackNotice;
  /** F2: the same, at 48 h, to those who haven't answered. */
  'feedback.reminder': FeedbackNotice & { closesText: string };
  /** C15: a checkout the attendee started and didn't pay. */
  'checkout.unpaid': { registrationId: string; eventId: string; eventSlug?: string; eventTitle: string };
}

export interface SpaceStatusNotice {
  spaceId: string;
  spaceName: string;
}

/** A feedback ask (F2): the event and where the form opens. */
export interface FeedbackNotice {
  eventId: string;
  eventTitle: string;
}

export type NotifyKind = keyof NotifyKindData;

export interface KindDef<D> {
  category: NotificationCategory;
  criticality: Criticality;
  /**
   * The entity the dedup key hangs off; notify() keys each channel as
   * `${kind}:${entity}:${userId}:${channel}`. null = no dedup.
   */
  entity: (d: D) => string | null;
  /** The push copy; also the in-app inbox copy. */
  push: (d: D) => PushCopy;
  /**
   * The push copy goes to the in-app inbox only, with no device push: another
   * notice already buzzes the phone for the same moment.
   */
  inboxOnly?: true;
  email?: (svc: EmailService, to: string, d: D, delivery: DeliveryOpts) => Promise<boolean>;
}

const eventLink = (d: { eventSlug?: string; eventId: string }) => `unifesto://event/${d.eventSlug || d.eventId}`;
/**
 * Q10: a booking's pushes open its pass. The app keys tickets by event id (an
 * older app without the pass cached falls back to the Tickets tab).
 */
export const ticketLink = (eventId: string) => `unifesto://ticket/${eventId}`;
/** Q10: a waitlist offer opens the Waitlist tab, where its Pay card is. */
const WAITLIST_PAY = 'unifesto://tickets?tab=waitlist';

/**
 * A space status notice (Q39): critical, so the email always goes. The email
 * says the push's words, plus the reason when there is one.
 */
function spaceStatusKind<D extends SpaceStatusNotice>(
  entity: (d: D) => string,
  copy: (d: D) => { title: string; body: string; reason?: string | null },
): KindDef<D> {
  const push = (d: D): PushCopy => ({
    title: copy(d).title,
    body: copy(d).body,
    deepLink: `unifesto://manage/space/${d.spaceId}`,
    data: { type: 'space_status', spaceId: d.spaceId },
  });
  return {
    category: 'spaceUpdates',
    criticality: 'critical',
    entity,
    push,
    email: (svc, to, d, delivery) => {
      const { title, body, reason } = copy(d);
      const html =
        h1(esc(title)) +
        p(esc(body)) +
        (reason ? note(`Reason: ${esc(reason)}`, 'danger') : '') +
        button('Open my space', SPACE_APP);
      return svc.sendRawEmailTracked(to, title, html, undefined, delivery).then((r) => r.ok);
    },
  };
}

const SPACE_STATUS_COPY: Record<NotifyKindData['space.status']['status'], (d: NotifyKindData['space.status']) => { title: string; body: string }> = {
  ACTIVE: (d) => ({ title: `${d.spaceName} is live again`, body: 'You can publish events and sell tickets again.' }),
  INACTIVE: (d) => ({ title: `${d.spaceName} is paused`, body: 'Unifesto paused it. Existing tickets still check in.' }),
  SUSPENDED: (d) => ({
    title: `${d.spaceName} is suspended`,
    body: 'It is hidden and can\'t sell tickets. Existing tickets still check in. You can appeal from its settings.',
  }),
  ARCHIVED: (d) =>
    d.bySystem
      ? { title: `${d.spaceName} is archived`, body: 'It had no events for 180 days. Restore it any time from its settings.' }
      : { title: `${d.spaceName} is archived`, body: 'Unifesto archived it. Ask from its settings to restore it.' },
};

/** A feedback ask: low (push + inbox, no email), once per event per attendee. */
function feedbackKind<D extends FeedbackNotice>(title: (d: D) => string, body: (d: D) => string): KindDef<D> {
  return {
    category: 'eventReminders',
    criticality: 'low',
    entity: (d) => d.eventId,
    push: (d) => ({
      title: title(d),
      body: body(d),
      deepLink: `unifesto://feedback/${d.eventId}`,
      data: { type: 'feedback', eventId: d.eventId },
    }),
  };
}

export const NOTIFY_KINDS: { [K in NotifyKind]: KindDef<NotifyKindData[K]> } = {
  'payment.confirmed': {
    category: 'registrationUpdates',
    criticality: 'critical',
    // The RegistrationConfirmed "You're in!" push already covers this moment:
    // the receipt is email + inbox.
    inboxOnly: true,
    entity: (d) => d.razorpayPaymentId,
    push: (d) => ({
      title: 'Payment received',
      body: `Your payment for ${d.eventTitle} went through. Your ticket is in the app.`,
      deepLink: ticketLink(d.eventId),
      data: { type: 'payment', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendPaymentConfirmation({ ...d, email: to }, delivery),
  },
  'waitlist.offer': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.entryId,
    push: (d) => ({
      title: `A spot opened up for ${d.eventTitle}`,
      body: `You're off the waitlist.${d.expiresInHours ? ` Claim it within ${d.expiresInHours} hours.` : ' Claim it before it goes.'}`,
      deepLink: WAITLIST_PAY,
      data: { type: 'waitlist_offer', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendWaitlistPromoted({ ...d, email: to }, delivery),
  },
  'event.cancelled': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.eventId,
    push: (d) => ({
      title: `${d.eventTitle} was cancelled`,
      body: d.refundInfo || d.cancellationReason || 'The organisers cancelled this event. Details are in your email.',
      deepLink: `unifesto://event/${d.eventId}`,
      data: { type: 'event_cancelled', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendEventCancelled({ ...d, email: to }, delivery),
  },
  'event.updated': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: () => null,
    push: (d) => ({
      title: `${d.eventTitle} was updated`,
      body: d.changes.length
        ? `Changed: ${d.changes.map((c) => c.field).join(', ')}. Check the details before you go.`
        : 'Check the latest details before you go.',
      deepLink: eventLink(d),
      data: { type: 'event_updated', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendEventUpdated({ ...d, email: to }, delivery),
  },
  'space.approved': {
    category: 'spaceUpdates',
    criticality: 'critical',
    entity: (d) => `${d.spaceId}:${d.approvedAt.getTime()}`,
    push: (d) => ({
      title: `${d.spaceName} is live`,
      body: 'Tap to open it and set up your first event.',
      deepLink: `unifesto://manage/space/${d.spaceId}`,
      data: { type: 'space_approved', spaceId: d.spaceId },
    }),
    email: (svc, to, d, delivery) => svc.sendSpaceApproved({ ...d, email: to }, delivery),
  },
  'space.rejected': {
    category: 'spaceUpdates',
    criticality: 'critical',
    // A space can be rejected again after a resubmission: no default dedup.
    entity: () => null,
    push: (d) => ({
      title: `${d.spaceName} wasn't approved`,
      body: 'We emailed you the reason and what to change.',
      // Q19: the app's space request screen shows the reviewer's reason.
      ...('requestId' in d
        ? { deepLink: 'unifesto://space-request', data: { type: 'space_rejected', requestId: d.requestId } }
        : { data: { type: 'space_rejected', spaceId: d.spaceId } }),
    }),
    email: (svc, to, d, delivery) => svc.sendSpaceRejected({ ...d, email: to }, delivery),
  },
  'space.status': spaceStatusKind(
    (d) => `${d.spaceId}:${d.changedAt.getTime()}`,
    (d) => ({ ...SPACE_STATUS_COPY[d.status](d), reason: d.reason }),
  ),
  'space.archive_warning': spaceStatusKind(
    (d) => `${d.spaceId}:${d.archiveOnText}`,
    (d) => ({
      title: `${d.spaceName} will be archived on ${d.archiveOnText}`,
      body: 'It has had no events since it was made. Create an event to keep it, or let it go. You can restore an archived space any time.',
    }),
  ),
  'space.quiet': {
    category: 'spaceUpdates',
    criticality: 'normal',
    entity: (d) => `${d.spaceId}:${d.nudgedAt.getTime()}`,
    push: (d) => ({
      title: `No events at ${d.spaceName} in 2 months`,
      body: 'Make the next one. It takes three steps.',
      deepLink: `unifesto://manage/space/${d.spaceId}`,
      data: { type: 'space_quiet', spaceId: d.spaceId },
    }),
    email: (svc, to, d, delivery) => {
      const title = `No events at ${d.spaceName} in 2 months`;
      const html =
        h1(esc(title)) +
        p('Your members are waiting for the next one. A workshop, an induction or an info session all count, and free events cost nothing.') +
        button('Create an event', `${SPACE_APP}/events/new?space=${d.spaceId}`) +
        p('Taking a break? You can pause the space from its settings and resume it any time.');
      return svc.sendRawEmailTracked(to, title, html, undefined, delivery).then((r) => r.ok);
    },
  },
  'space.inquiry': {
    category: 'spaceUpdates',
    criticality: 'normal',
    entity: (d) => d.leadId,
    push: (d) => ({
      title: `New inquiry for ${d.spaceName}`,
      body: d.message ? `${d.fromName || d.fromEmail}: ${d.message.slice(0, 120)}` : `${d.fromName || d.fromEmail} wants to get in touch.`,
      deepLink: `unifesto://manage/space/${d.spaceId}/leads`,
      data: { type: 'space_inquiry', spaceId: d.spaceId },
    }),
    email: (svc, to, d, delivery) => svc.sendSpaceInquiry({ ...d, email: to }, delivery),
  },
  'feedback.request': feedbackKind(
    (d) => `How was ${d.eventTitle}?`,
    () => 'Rate it in a few taps. The organisers read every answer.',
  ),
  'feedback.reminder': feedbackKind(
    (d) => `Rate ${d.eventTitle}`,
    (d) => `Feedback closes ${d.closesText}. It takes under a minute.`,
  ),
  // Low: push + inbox, no email, once per checkout. An event reminder, so the
  // person's reminder switch and quiet hours apply. The copy promises no seat:
  // nothing is held for an unpaid checkout, and the event page says if it sold out.
  'checkout.unpaid': {
    category: 'eventReminders',
    criticality: 'low',
    entity: (d) => d.registrationId,
    push: (d) => ({
      title: `Finish booking ${d.eventTitle}`,
      body: "You started checkout but didn't pay. Tap to pick up where you left off.",
      deepLink: eventLink(d),
      data: { type: 'checkout_unpaid', eventId: d.eventId },
    }),
  },
};
