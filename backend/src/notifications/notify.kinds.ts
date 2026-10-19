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
  /** Not deduped by default (an event can change twice); pass opts.dedupKey per change. */
  'event.updated': MailData<T.EventUpdatedData> & { eventId: string; eventSlug?: string };
  'stay.payment_due': { bookingId: string; eventId?: string; userName: string; stayName: string; amountText: string; dueText: string };
  'stay.confirmed': { bookingId: string; eventId?: string; userName: string; stayName: string; note?: string };
  'space.approved': MailData<T.SpaceApprovedData> & { spaceId: string };
  /** Not deduped by default (a resubmitted space can be rejected again). */
  'space.rejected': MailData<T.SpaceRejectedData> & { spaceId: string };
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
  push: (d: D) => PushCopy;
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

/** Stay mail: C9's stayUpdateEmail says the same words as the push. */
function stayEmail<D extends { eventId?: string; userName: string }>(copy: (d: D) => PushCopy) {
  return (svc: EmailService, to: string, d: D, delivery: DeliveryOpts) => {
    const { title, body } = copy(d);
    return svc.sendStayUpdate({ email: to, eventId: d.eventId, userName: d.userName, title, body }, delivery);
  };
}

const stayPaymentDueCopy = (d: NotifyKindData['stay.payment_due']): PushCopy => ({
  title: 'Stay request approved',
  body: `Pay ${d.amountText} by ${d.dueText} to confirm your bed at ${d.stayName}.`,
  deepLink: `unifesto://stay/pass/${d.bookingId}`,
  data: { type: 'stay', bookingId: d.bookingId },
});

const stayConfirmedCopy = (d: NotifyKindData['stay.confirmed']): PushCopy => ({
  title: 'Your stay is confirmed',
  body: `Your Stay Pass for ${d.stayName} is ready.${d.note ? ` ${d.note}` : ''}`,
  deepLink: `unifesto://stay/pass/${d.bookingId}`,
  data: { type: 'stay', bookingId: d.bookingId },
});

export const NOTIFY_KINDS: { [K in NotifyKind]: KindDef<NotifyKindData[K]> } = {
  'registration.confirmed': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.registrationId,
    push: (d) => ({
      title: "You're in!",
      body: `Your spot for ${d.eventTitle} is confirmed.`,
      deepLink: eventLink(d),
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
    entity: (d) => d.razorpayPaymentId,
    push: (d) => ({
      title: 'Payment received',
      body: `Your payment for ${d.eventTitle} went through. Your ticket is in the app.`,
      deepLink: eventLink(d),
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
      deepLink: eventLink(d),
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
      deepLink: eventLink(d),
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
      deepLink: eventLink(d),
      data: { type: 'event_reminder', eventId: d.eventId },
    }),
    email: (svc, to, d, delivery) => svc.sendEventReminder({ ...d, email: to }, delivery),
  },
  'event.reminder.1h': {
    category: 'eventReminders',
    criticality: 'normal',
    entity: (d) => d.eventId,
    push: (d) => ({
      title: `Starting soon: ${d.eventTitle}`,
      body: `${d.eventTitle} starts in ${d.startsInMinutes} minutes. Your ticket is in the app.`,
      deepLink: eventLink(d),
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
    criticality: 'normal',
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
  'stay.payment_due': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.bookingId,
    push: stayPaymentDueCopy,
    email: stayEmail(stayPaymentDueCopy),
  },
  'stay.confirmed': {
    category: 'registrationUpdates',
    criticality: 'critical',
    entity: (d) => d.bookingId,
    push: stayConfirmedCopy,
    email: stayEmail(stayConfirmedCopy),
  },
  'space.approved': {
    category: 'spaceUpdates',
    criticality: 'critical',
    entity: (d) => d.spaceId,
    push: (d) => ({
      title: `${d.spaceName} is approved`,
      body: 'Your space is live. Open the Space app to create your first event.',
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
      data: { type: 'space_rejected', spaceId: d.spaceId },
    }),
    email: (svc, to, d, delivery) => svc.sendSpaceRejected({ ...d, email: to }, delivery),
  },
};
