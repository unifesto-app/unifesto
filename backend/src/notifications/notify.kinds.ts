import type { EmailService } from '../email/email.service';
import type * as T from '../email/templates';
import type { WhatsAppService } from '../whatsapp/whatsapp.service';
import type { DeliveryOpts } from './message-delivery';
import type { NotificationCategory } from './notifications.constants';

/**
 * The notify() kind registry (C2). Each kind says which push category it
 * belongs to, how critical it is (see channelsFor in notify.policy.ts), and how
 * it renders on each channel. Email and WhatsApp delegate to the existing
 * EmailService / WhatsAppService methods: no template lives here.
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

/** Every stay notice: the booking, and the words the push and email share. */
export interface StayNotice {
  bookingId: string;
  eventId?: string;
  userName: string;
  stayName: string;
}

/** What each kind's caller passes to notify(). */
export interface NotifyKindData {
  'registration.confirmed': MailData<T.RegistrationConfirmationData> & { registrationId: string; eventId: string };
  'payment.confirmed': MailData<T.PaymentConfirmationData> & { eventId: string; eventSlug?: string };
  /** Seat held, payment needed to claim it. */
  'waitlist.offer': MailData<T.WaitlistPromotedData> & { entryId: string; eventId: string; eventSlug?: string };
  /** Free ticket: off the waitlist and already confirmed. */
  'waitlist.promoted': MailData<T.WaitlistPromotedData> & { entryId: string; eventId: string; eventSlug?: string };
  'event.reminder.24h': MailData<T.EventReminderData> & { eventId: string; eventSlug?: string };
  'event.reminder.1h': MailData<T.EventStartingSoonData> & { eventId: string; eventSlug?: string };
  'event.cancelled': MailData<T.EventCancelledData> & { eventId: string };
  /**
   * Critical: a time or venue change must reach everyone by email. Not deduped
   * by default (an event can change twice); pass opts.dedupKey per change.
   */
  'event.updated': MailData<T.EventUpdatedData> & { eventId: string; eventSlug?: string };
  'stay.payment_due': StayNotice & { amountText: string; dueText: string };
  'stay.confirmed': StayNotice & { note?: string };
  'stay.declined': StayNotice & { reason?: string };
  'stay.cancelled': StayNotice & { reason?: string; refundText?: string };
  /** A late payment sent back in full. */
  'stay.refunded': StayNotice & { amountText: string };
  /** The payment window closed and the bed was released. */
  'stay.expired': StayNotice;
  /** approvedAt keys the dedup per approval, so approve, reject, approve tells them again. */
  'space.approved': MailData<T.SpaceApprovedData> & { spaceId: string; approvedAt: Date };
  /**
   * Not deduped by default (a resubmitted space can be rejected again). A
   * rejected space request (Q19) has no space yet, only the request.
   */
  'space.rejected': MailData<T.SpaceRejectedData> & ({ spaceId: string } | { requestId: string });
  /** To each Space Admin: a note from the public space page. One per lead. */
  'space.inquiry': MailData<T.SpaceInquiryData> & { spaceId: string; leadId: string };
  /** F2: to checked-in attendees 2 h after the event ends. Push + inbox only. */
  'feedback.request': FeedbackNotice;
  /** F2: the same, at 48 h, to those who haven't answered. */
  'feedback.reminder': FeedbackNotice & { closesText: string };
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
  /**
   * Time-sensitive: the push is useless later ("starting in 60 minutes"), so
   * quiet hours never hold it back. Critical kinds are urgent anyway.
   */
  urgent?: true;
  email?: (svc: EmailService, to: string, d: D, delivery: DeliveryOpts) => Promise<boolean>;
  /**
   * WhatsApp costs money per message. Standing decision: only OTP, ONE
   * registration confirmation, group invites and stats use it, so only
   * registration.confirmed sets this. Don't add it lightly.
   * (registration.confirmed is not routed through notify() yet: C9's
   * sendPaidConfirmations + Redis reg:confirmation guard own it for now.)
   */
  whatsapp?: (svc: WhatsAppService, phone: string, d: D, delivery: DeliveryOpts) => Promise<boolean>;
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
 * A stay notice: critical (push + email always, as C9 sent them), deduped per
 * booking (each state is entered once), and the email says the push's words.
 */
function stayKind<D extends StayNotice>(title: string, body: (d: D) => string): KindDef<D> {
  const push = (d: D): PushCopy => ({
    title,
    body: body(d),
    deepLink: `unifesto://stay/pass/${d.bookingId}`,
    data: { type: 'stay', bookingId: d.bookingId },
  });
  return {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.bookingId,
    push,
    email: (svc, to, d, delivery) =>
      svc.sendStayUpdate({ email: to, eventId: d.eventId, userName: d.userName, title, body: body(d) }, delivery),
  };
}

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
  'registration.confirmed': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.registrationId,
    push: (d) => ({
      title: "You're in!",
      body: `Your spot for ${d.eventTitle} is confirmed.`,
      deepLink: ticketLink(d.eventId),
      data: { type: 'registration', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendRegistrationConfirmation({ ...d, email: to }, delivery),
    whatsapp: (svc, phone, d, delivery) =>
      svc.sendRegistrationConfirmation(
        phone,
        {
          userName: d.userName,
          eventTitle: d.eventTitle,
          eventDate: d.eventDate,
          eventTime: d.eventTime,
          venueName: d.venueName,
          city: d.city,
          isOnline: d.isOnline,
          onlineUrl: d.onlineUrl,
        },
        delivery,
      ),
  },
  'payment.confirmed': {
    category: 'registrationUpdates',
    criticality: 'critical',
    // registration.confirmed's "You're in!" push already covers this moment:
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
  'waitlist.promoted': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.entryId,
    push: (d) => ({
      title: "You're off the waitlist!",
      body: `Your spot for ${d.eventTitle} is confirmed.`,
      deepLink: ticketLink(d.eventId),
      data: { type: 'registration', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendWaitlistPromoted({ ...d, amountDue: 0, email: to }, delivery),
  },
  'event.reminder.24h': {
    category: 'eventReminders',
    criticality: 'normal',
    entity: (d) => d.eventId,
    push: (d) => ({
      title: `Tomorrow: ${d.eventTitle}`,
      body: `${d.eventTitle} starts in about 24 hours. See you there!`,
      deepLink: ticketLink(d.eventId),
      data: { type: 'event_reminder', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendEventReminder({ ...d, email: to }, delivery),
  },
  'event.reminder.1h': {
    category: 'eventReminders',
    criticality: 'normal',
    urgent: true,
    entity: (d) => d.eventId,
    push: (d) => ({
      title: `Starting soon: ${d.eventTitle}`,
      body: `${d.eventTitle} starts in ${d.startsInMinutes} minutes. Your ticket is in the app.`,
      deepLink: ticketLink(d.eventId),
      data: { type: 'event_reminder', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendEventStartingSoon({ ...d, email: to }, delivery),
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
  'stay.payment_due': stayKind('Stay request approved', (d) =>
    `Pay ${d.amountText} by ${d.dueText} to confirm your bed at ${d.stayName}.`),
  'stay.confirmed': stayKind('Your stay is confirmed', (d) =>
    `Your Stay Pass for ${d.stayName} is ready.${d.note ? ` ${d.note}` : ''}`),
  'stay.declined': stayKind('Stay request declined', (d) =>
    `${d.stayName}: ${d.reason || "the event team couldn't fit you in this time."}`),
  'stay.cancelled': stayKind('Your stay was cancelled', (d) =>
    `${d.stayName}: ${d.reason || 'cancelled by the event team'}.${d.refundText ? ` ${d.refundText} is being refunded (5–7 days).` : ''}`),
  'stay.refunded': stayKind('Stay payment refunded', (d) =>
    `Your payment for ${d.stayName} arrived after the booking closed, so ${d.amountText} is on its way back.`),
  'stay.expired': stayKind('Stay payment window closed', (d) =>
    `Your bed at ${d.stayName} was released because it wasn't paid in time.`),
  'space.approved': {
    category: 'spaceUpdates',
    criticality: 'critical',
    entity: (d) => `${d.spaceId}:${d.approvedAt.getTime()}`,
    push: (d) => ({
      title: `${d.spaceName} is approved`,
      body: 'Your space is live. Tap to open it and set up your first event.',
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
};
