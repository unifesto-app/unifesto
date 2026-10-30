// Every transactional email Unifesto sends, as pure data -> { subject, html }.
// EmailService picks the channel and sends; this file only decides what the
// mail says. Copy rules: sentence case, no em dashes, crisp and specific.
import {
  APEX, SPACE_APP, SUPPORT, WEB,
  button, code, details, esc, faint, greet, h1, inr, layout, link, list, note, p, qr, small, strong,
  type EmailBrand,
} from './layout';
import { PLAN_NAMES } from '../subscription/plan-limits.config';

/** A plan code as organisers know it ("STARTER" -> "General"). */
const planName = (code: string) => PLAN_NAMES[code as keyof typeof PLAN_NAMES] ?? code;

export interface Email {
  subject: string;
  html: string;
}

type EventWhere = {
  venueName?: string;
  city?: string;
  isOnline: boolean;
  onlineUrl?: string;
};

/** Branded mail points back at the space, not Unifesto's listing. */
const moreEvents = (brand?: EmailBrand | null) =>
  brand ? button(`More from ${brand.name}`, brand.url) : button('Find another event', `${WEB}/events`);

/**
 * "Also in the app" footnotes. On a white-label (branded) mail the line must not
 * read as Unifesto branding, so it switches to a neutral sentence. Add new
 * app mentions here, not inline in a template.
 */
const APP_LINES = {
  ticket: ['Your ticket is also in the Unifesto app. See you there.', 'You can also find your ticket in the Unifesto app. See you there.'],
  stay: ['Your Stay Pass and booking details are in the Unifesto app.', 'You can also find your Stay Pass and booking details in the Unifesto app.'],
} as const;

export const appLine = (kind: keyof typeof APP_LINES, brand?: EmailBrand | null) =>
  small(APP_LINES[kind][brand ? 1 : 0]);

/** "Online" with the join link, or "Venue, City". */
function where(e: EventWhere): string | undefined {
  if (e.isOnline) return e.onlineUrl ? link('Join online', e.onlineUrl) : 'Online';
  const place = [e.venueName, e.city].filter(Boolean).join(', ');
  return place ? esc(place) : undefined;
}

function eventCard(e: EventWhere & { eventTitle: string; eventDate?: string; eventTime?: string }): string {
  return details(
    [
      ['Date', e.eventDate && esc(e.eventDate)],
      ['Time', e.eventTime && esc(e.eventTime)],
      [e.isOnline ? 'Where' : 'Venue', where(e)],
    ],
    esc(e.eventTitle),
  );
}

// =====================================================
// ACCOUNT
// =====================================================

export function otpEmail(otp: string): Email {
  return {
    subject: `${otp} is your Unifesto code`,
    html: layout(
      `${h1('Your sign-in code')}
      ${p('Enter this code to sign in to Unifesto.')}
      ${code(otp)}
      ${small("It expires in 10 minutes. Don't share it with anyone. If you didn't ask for it, you can ignore this email.")}`,
      `Your code is ${otp}. It expires in 10 minutes.`,
    ),
  };
}

export function welcomeEmail(userName: string): Email {
  return {
    subject: 'Welcome to Unifesto',
    html: layout(
      `${h1(`Welcome, ${esc(userName || 'there')}`)}
      ${p("You're in. Here's what you can do on Unifesto:")}
      ${list([
        'Find events, hackathons and huddles near you',
        'Register in a tap and keep every ticket in one place',
        'Start a space and host your own',
      ])}
      ${button('Explore events', `${WEB}/events`)}`,
      'Find events, keep your tickets, host your own.',
    ),
  };
}

/** J17: a new provider identity was linked to the account. */
export function signInMethodAddedEmail(method: string): Email {
  return {
    subject: 'New sign-in method added to your Unifesto account',
    html: layout(
      `${h1('New sign-in method added')}
      ${p(`${strong(esc(method))} can now be used to sign in to your Unifesto account.`)}
      ${p(`If this was you, there's nothing to do. If not, contact ${link(SUPPORT, `mailto:${SUPPORT}`)} right away so we can lock the account.`)}`,
      `${method} can now sign in to your account.`,
    ),
  };
}

// =====================================================
// REGISTRATIONS & TICKETS
// =====================================================

export interface RegistrationConfirmationData extends EventWhere {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  qrCode: string;
  ticketCode?: string;
  // Raw event fields for the calendar (.ics) attachment. Optional and
  // backward-compatible: when all of slug/start/end/timezone are present the
  // confirmation email carries an "Add to calendar" .ics; otherwise it doesn't.
  eventSlug?: string;
  eventStartDateTime?: Date;
  eventEndDateTime?: Date;
  eventTimezone?: string;
  eventType?: string; // 'IN_PERSON' | 'ONLINE' | 'HYBRID'
  venueAddress?: string;
  eventDescription?: string;
  organiserName?: string;
}

export function registrationConfirmationEmail(d: RegistrationConfirmationData): Email {
  return {
    subject: `You're registered for ${d.eventTitle}`,
    html: layout(
      `${h1("You're registered")}
      ${greet(d.userName)}
      ${p(`Your spot at ${strong(d.eventTitle)} is confirmed.`)}
      ${eventCard(d)}
      ${qr(d.qrCode, d.ticketCode)}
      ${d.eventSlug ? button('View event', `${d.brand?.webBase ?? WEB}/event/${encodeURIComponent(d.eventSlug)}`) : ''}
      ${appLine('ticket', d.brand)}`,
      `${d.eventDate}, ${d.eventTime}. Your ticket is inside.`,
      d.brand,
    ),
  };
}

export interface PaymentConfirmationData extends EventWhere {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  amount: number;
  processingFee: number;
  razorpayPaymentId: string;
  ticketCode?: string;
  qrCode: string;
}

export function paymentConfirmationEmail(d: PaymentConfirmationData): Email {
  return {
    subject: `Payment received for ${d.eventTitle}`,
    html: layout(
      `${h1('Payment received')}
      ${greet(d.userName)}
      ${p(`Thanks, your payment went through and your spot at ${strong(d.eventTitle)} is confirmed.`)}
      ${eventCard(d)}
      ${details([
        ['Amount paid', inr(d.amount)],
        ['Processing fee', d.processingFee ? inr(d.processingFee) : null],
        ['Payment ID', esc(d.razorpayPaymentId)],
      ])}
      ${qr(d.qrCode, d.ticketCode)}`,
      `${inr(d.amount)} paid. Your ticket is inside.`,
      d.brand,
    ),
  };
}

export interface CancellationConfirmationData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  razorpayRefundInitiated?: boolean;
  razorpayRefundAmount?: number;
  /** Set when the organiser cancelled it; their free-text reason. */
  organiserReason?: string;
}

export function cancellationConfirmationEmail(d: CancellationConfirmationData): Email {
  const byOrganiser = !!d.organiserReason;
  return {
    subject: `Registration cancelled for ${d.eventTitle}`,
    html: layout(
      `${h1('Registration cancelled')}
      ${greet(d.userName)}
      ${p(`Your registration for ${strong(d.eventTitle)} has been cancelled${byOrganiser ? ' by the organiser' : ''}.`)}
      ${byOrganiser ? note(`Reason from the organiser: ${esc(d.organiserReason)}`) : ''}
      ${d.razorpayRefundInitiated && d.razorpayRefundAmount
        ? note(`A refund of ${strong(inr(d.razorpayRefundAmount))} is on its way. It reaches your original payment method in 5 to 7 business days.`, 'success')
        : ''}
      ${moreEvents(d.brand)}`,
      '',
      d.brand,
    ),
  };
}

export interface EventReminderData extends EventWhere {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  qrCode: string;
  ticketCode?: string;
}

export function eventReminderEmail(d: EventReminderData): Email {
  return {
    subject: `Tomorrow: ${d.eventTitle}`,
    html: layout(
      `${h1("It's tomorrow")}
      ${greet(d.userName)}
      ${p(`A quick reminder that ${strong(d.eventTitle)} is coming up.`)}
      ${eventCard(d)}
      ${qr(d.qrCode, d.ticketCode)}`,
      `${d.eventTime}. Have your QR ready.`,
      d.brand,
    ),
  };
}

export interface EventStartingSoonData extends EventWhere {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  startsInMinutes: number;
  qrCode: string;
}

function inTime(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  return `${minutes} minutes`;
}

export function eventStartingSoonEmail(d: EventStartingSoonData): Email {
  const soon = inTime(d.startsInMinutes);
  return {
    subject: `Starting in ${soon}: ${d.eventTitle}`,
    html: layout(
      `${h1(`Starting in ${soon}`)}
      ${greet(d.userName)}
      ${p(`${strong(d.eventTitle)} starts soon.`)}
      ${details([[d.isOnline ? 'Where' : 'Venue', where(d)]])}
      ${d.isOnline && d.onlineUrl ? button('Join now', d.onlineUrl) : qr(d.qrCode)}`,
      '',
      d.brand,
    ),
  };
}

export interface EventCancelledData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  cancellationReason?: string;
  refundInfo?: string;
}

export function eventCancelledEmail(d: EventCancelledData): Email {
  return {
    subject: `Cancelled: ${d.eventTitle}`,
    html: layout(
      `${h1('This event is cancelled')}
      ${greet(d.userName)}
      ${p(`We're sorry. ${strong(d.eventTitle)} on ${esc(d.eventDate)} has been cancelled by the organiser.`)}
      ${d.cancellationReason ? note(`Reason: ${esc(d.cancellationReason)}`) : ''}
      ${d.refundInfo ? note(esc(d.refundInfo), 'success') : ''}
      ${moreEvents(d.brand)}`,
      '',
      d.brand,
    ),
  };
}

export interface EventUpdatedData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  changes: { field: string; oldValue: string; newValue: string }[];
  newDate?: string;
  newTime?: string;
  newVenue?: string;
}

export function eventUpdatedEmail(d: EventUpdatedData): Email {
  const rows = d.changes.map(
    (c): [string, string] => [
      c.field,
      `${faint(`<s>${esc(c.oldValue)}</s>`)}<br>${esc(c.newValue)}`,
    ],
  );
  return {
    subject: `Updated: ${d.eventTitle}`,
    html: layout(
      `${h1('Event details changed')}
      ${greet(d.userName)}
      ${p(`The organiser of ${strong(d.eventTitle)} changed a few things.`)}
      ${details(rows.length ? rows : [
        ['Date', d.newDate && esc(d.newDate)],
        ['Time', d.newTime && esc(d.newTime)],
        ['Venue', d.newVenue && esc(d.newVenue)],
      ])}
      ${p('Your registration still stands. Nothing to do on your side.')}`,
      '',
      d.brand,
    ),
  };
}

/**
 * To someone who tapped "Notify me" on an event (a lead, not an attendee): a
 * date or venue change, or the day-before reminder. The web form promises
 * exactly these two, so this mail says so and sends nothing else.
 */
export interface EventInterestData extends EventWhere {
  brand?: EmailBrand | null;
  eventId?: string;
  email: string;
  name?: string;
  eventTitle: string;
  eventSlug: string;
  eventDate: string;
  eventTime: string;
  /** A date or venue change; absent for the day-before reminder. */
  changes?: { field: string; oldValue: string; newValue: string }[];
}

export function eventInterestEmail(d: EventInterestData): Email {
  const url = `${d.brand?.webBase ?? WEB}/event/${encodeURIComponent(d.eventSlug)}`;
  const changed = !!d.changes?.length;
  const rows = (d.changes ?? []).map(
    (c): [string, string] => [c.field, `${faint(`<s>${esc(c.oldValue)}</s>`)}<br>${esc(c.newValue)}`],
  );
  return {
    subject: changed ? `Updated: ${d.eventTitle}` : `Tomorrow: ${d.eventTitle}`,
    html: layout(
      `${h1(changed ? 'Event details changed' : "It's tomorrow")}
      ${greet(d.name)}
      ${p(changed ? `The organiser of ${strong(d.eventTitle)} changed a few things.` : `${strong(d.eventTitle)} is coming up tomorrow.`)}
      ${changed ? details(rows) : eventCard(d)}
      ${button('View event', url)}
      ${small('You asked to hear about this event with Notify me, so you get its changes and a reminder the day before. Nothing else.')}`,
      changed ? `${d.eventTitle} changed.` : `${d.eventTitle}, ${d.eventTime}.`,
      d.brand,
    ),
  };
}

export interface EventPublishedData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  spaceName: string;
  registrationUrl: string;
}

export function eventPublishedEmail(d: EventPublishedData): Email {
  return {
    subject: `New from ${d.spaceName}: ${d.eventTitle}`,
    html: layout(
      `${h1(`New from ${esc(d.spaceName)}`)}
      ${greet(d.userName)}
      ${p('A space you follow just published an event.')}
      ${eventCard(d)}
      ${button('View and register', d.registrationUrl)}`,
      `${d.eventTitle}, ${d.eventDate}.`,
    ),
  };
}

export interface EventSummaryData {
  email: string;
  userName: string;
  eventTitle: string;
  attendeeCount: number;
  photosUrl?: string;
}

export function eventSummaryEmail(d: EventSummaryData): Email {
  return {
    subject: `Thanks for coming to ${d.eventTitle}`,
    html: layout(
      `${h1('Thanks for coming')}
      ${greet(d.userName)}
      ${p(`You were one of ${strong(d.attendeeCount.toLocaleString('en-IN'))} people at ${strong(d.eventTitle)}. We hope it was worth it.`)}
      ${d.photosUrl ? button('See the photos', d.photosUrl) : ''}
      ${p(`Find what's next on ${link('Unifesto', `${WEB}/events`)}.`)}`,
    ),
  };
}

// =====================================================
// WAITING LIST
// =====================================================

export interface WaitlistConfirmationData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  waitlistPosition: number;
}

export function waitlistConfirmationEmail(d: WaitlistConfirmationData): Email {
  return {
    subject: `You're on the waiting list for ${d.eventTitle}`,
    html: layout(
      `${h1("You're on the waiting list")}
      ${greet(d.userName)}
      ${p(`${strong(d.eventTitle)} on ${esc(d.eventDate)} is full right now.`)}
      ${details([['Your position', `#${d.waitlistPosition}`]])}
      ${p("If a spot opens up for you, we'll email you straight away.")}`,
      '',
      d.brand,
    ),
  };
}

export interface WaitlistPromotedData extends EventWhere {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  registrationUrl: string;
  /** Hours to pay before the seat is released, or null when the hold has no deadline. */
  expiresInHours: number | null;
  /**
   * What the attendee owes to claim the spot, in INR. 0 means the ticket is
   * free and the spot is already confirmed: the email must not then ask for
   * payment or imply the seat can still be lost.
   */
  amountDue?: number;
}

export function waitlistPromotedEmail(d: WaitlistPromotedData): Email {
  const owesPayment = (d.amountDue ?? 0) > 0;
  const hasDeadline = owesPayment && (d.expiresInHours ?? 0) > 0;

  const action = owesPayment
    ? `${details([
        ['Amount due', strong(inr(d.amountDue!))],
        ['Pay within', hasDeadline && `${d.expiresInHours} hours`],
      ])}
      ${p(hasDeadline
        ? 'Your seat is held until then. If payment does not come through in time, it goes back to the waiting list.'
        : 'Your seat is held for you. Pay soon to confirm it, as the organiser can release it if it stays unpaid.')}
      ${button('Pay and confirm my spot', d.registrationUrl)}`
    : `${p('This ticket is free, so there is nothing to pay. Your spot is confirmed.')}
      ${button('View my ticket', d.registrationUrl)}`;

  return {
    subject: `A spot opened up for ${d.eventTitle}`,
    html: layout(
      `${h1(owesPayment ? "You're in. Payment needed" : "You're in")}
      ${greet(d.userName)}
      ${p(`A spot opened up for you at ${strong(d.eventTitle)}.`)}
      ${eventCard(d)}
      ${action}`,
      '',
      d.brand,
    ),
  };
}

export interface WaitlistRevokedData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  /** Where they can re-join the queue if they still want in. */
  registrationUrl: string;
}

export function waitlistRevokedEmail(d: WaitlistRevokedData): Email {
  return {
    subject: `Your spot for ${d.eventTitle} was released`,
    html: layout(
      `${h1('Your spot was released')}
      ${greet(d.userName)}
      ${p(`A spot at ${strong(d.eventTitle)} on ${esc(d.eventDate)} was held for you, but it went unpaid, so the organiser released it to someone else.`)}
      ${p("Nothing was charged. If you still want to go, you can join the waiting list again.")}
      ${button('View the event', d.registrationUrl)}`,
      '',
      d.brand,
    ),
  };
}

// =====================================================
// STAYS
// =====================================================

export interface StayUpdateData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** The stay's event, so EmailService resolves the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  /** Same words as the push: the title is the heading and subject. */
  title: string;
  body: string;
}

export function stayUpdateEmail(d: StayUpdateData): Email {
  return {
    subject: d.title,
    html: layout(
      `${h1(esc(d.title))}
      ${greet(d.userName)}
      ${p(esc(d.body))}
      ${appLine('stay', d.brand)}`,
      '',
      d.brand,
    ),
  };
}

// =====================================================
// PAYMENTS
// =====================================================

export interface PaymentFailedData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  userName: string;
  eventTitle: string;
  amount: number;
  reason?: string;
  retryUrl: string;
}

export function paymentFailedEmail(d: PaymentFailedData): Email {
  return {
    subject: `Payment didn't go through for ${d.eventTitle}`,
    html: layout(
      `${h1("Your payment didn't go through")}
      ${greet(d.userName)}
      ${p(`We couldn't take your payment of ${strong(inr(d.amount))} for ${strong(d.eventTitle)}. If any money left your account, it is returned automatically.`)}
      ${d.reason ? note(`Reason: ${esc(d.reason)}`, 'danger') : ''}
      ${button('Try again', d.retryUrl)}`,
      '',
      d.brand,
    ),
  };
}

export interface BankAccountRejectedData {
  email: string;
  userName: string;
  bankName: string;
  accountNumber: string; // last 4 digits only
  rejectionReason: string;
}

export function bankAccountRejectedEmail(d: BankAccountRejectedData): Email {
  return {
    subject: "We couldn't verify your payout account",
    html: layout(
      `${h1("We couldn't verify your payout account")}
      ${greet(d.userName)}
      ${p(`Your account ending ${strong(d.accountNumber)} at ${strong(d.bankName)} didn't pass verification.`)}
      ${note(`Reason: ${esc(d.rejectionReason)}`, 'danger')}
      ${p('Update the details and submit it again to start receiving payouts.')}
      ${button('Update payout account', `${SPACE_APP}/financials?tab=accounts`)}`,
    ),
  };
}

// =====================================================
// CERTIFICATES
// =====================================================

export interface CertificateIssuedData {
  /** Space theme for the header, button and footer (gated by EmailService). */
  brand?: EmailBrand | null;
  /** Lets EmailService resolve the brand + sender. */
  eventId?: string;
  email: string;
  recipientName: string;
  eventTitle: string;
  /** The space/organiser that issued the certificate. */
  issuerName: string;
  certificateNumber: string;
  /** Public verify page for this certificate (carries the QR code too). */
  verifyUrl: string;
  /** Direct link to the rendered PDF in storage. */
  pdfUrl: string;
}

export function certificateIssuedEmail(d: CertificateIssuedData): Email {
  return {
    subject: `Your certificate for ${d.eventTitle}`,
    html: layout(
      `${h1('Your certificate is ready')}
      ${greet(d.recipientName)}
      ${p(`${strong(d.issuerName)} issued you a certificate for ${strong(d.eventTitle)}.`)}
      ${details([['Certificate no.', esc(d.certificateNumber)]])}
      ${button('Download my certificate', d.pdfUrl)}
      ${small(`Anyone can check it's genuine on its ${link('verification page', d.verifyUrl)}.`)}`,
      '',
      d.brand,
    ),
  };
}

// =====================================================
// SUPPORT (Assist cases)
// =====================================================

export interface SupportCaseUpdateData {
  email: string;
  name?: string | null;
  ticketNumber: number;
  subject: string;
  /** What happened, e.g. "New reply to your request". */
  headline: string;
  /** The message, shown as a quote. Plain text. */
  message?: string | null;
  /** Where to read and reply; without it the mail points at the app. */
  cta?: { label: string; url: string } | null;
}

export function supportCaseUpdateEmail(d: SupportCaseUpdateData): Email {
  return {
    subject: `${d.headline} · #${d.ticketNumber}`,
    html: layout(
      `${h1(esc(d.headline))}
      ${greet(d.name)}
      ${p(`${strong(`#${d.ticketNumber}`)} ${esc(d.subject)}`)}
      ${d.message ? note(esc(d.message).replace(/\n/g, '<br>')) : ''}
      ${d.cta ? button(d.cta.label, d.cta.url) : p('Open the Unifesto app and go to Help to read and reply.')}`,
    ),
  };
}

// =====================================================
// SPACES
// =====================================================

export interface SpaceApprovedData {
  email: string;
  organizerName: string;
  spaceName: string;
  spaceSlug: string;
}

export function spaceApprovedEmail(d: SpaceApprovedData): Email {
  return {
    subject: `${d.spaceName} is live on Unifesto`,
    html: layout(
      `${h1('Your space is live')}
      ${greet(d.organizerName)}
      ${p(`${strong(d.spaceName)} is approved and live. You can now:`)}
      ${list(['Create and publish events', 'Bring your team in as curators and crew', 'Build a following that hears about every event'])}
      ${button('Open my space', SPACE_APP)}
      ${small(`Public page: ${link(`unifesto.app/space/${d.spaceSlug}`, `${WEB}/space/${encodeURIComponent(d.spaceSlug)}`)}`)}`,
    ),
  };
}

/** To a Space Admin: someone sent the space a note from its public page. */
/**
 * E1: someone was given access by email (sponsor portal, judge or mentor, a
 * space role). The access is already there: signing in with this address is
 * all it takes, whether or not they had an account.
 */
export interface CollaboratorInviteData {
  email: string;
  name?: string | null;
  inviterName?: string | null;
  /** "a judge", "a Space Admin", "sponsor portal access"... */
  role: string;
  /** What it's for: an event, a space, "Acme at Robotics Club". */
  target: string;
  url: string;
  cta: string;
}

export function collaboratorInviteEmail(d: CollaboratorInviteData): Email {
  const by = d.inviterName ? strong(d.inviterName) : 'The organiser';
  return {
    subject: `You're invited: ${d.target}`,
    html: layout(
      `${h1("You're invited")}
      ${greet(d.name)}
      ${p(`${by} gave you ${esc(d.role)} for ${strong(d.target)}.`)}
      ${p(`Sign in to Unifesto with ${strong(d.email)} and it's there. New to Unifesto? Signing in with this email sets up your account.`)}
      ${button(d.cta, d.url)}
      ${small('Not expecting this? Ignore this email. Nothing is shared until you sign in.')}`,
      `${d.target}: ${d.role}`,
    ),
  };
}

export interface SpaceInquiryData {
  email: string;
  spaceName: string;
  fromName?: string;
  fromEmail: string;
  fromPhone?: string;
  message?: string;
}

export function spaceInquiryEmail(d: SpaceInquiryData): Email {
  return {
    subject: `New inquiry for ${d.spaceName}`,
    html: layout(
      `${h1('New inquiry')}
      ${p(`Someone sent ${strong(d.spaceName)} a note from its public page.`)}
      ${details([
        ['Name', d.fromName && esc(d.fromName)],
        ['Email', link(d.fromEmail, `mailto:${d.fromEmail}`)],
        ['Phone', d.fromPhone && esc(d.fromPhone)],
      ])}
      ${d.message ? note(esc(d.message)) : ''}
      ${button('Open leads', `${SPACE_APP}/leads`)}`,
      `From ${d.fromName || d.fromEmail}`,
    ),
  };
}

export interface SpaceRejectedData {
  email: string;
  organizerName: string;
  spaceName: string;
  rejectionReason: string;
}

export function spaceRejectedEmail(d: SpaceRejectedData): Email {
  return {
    subject: `Update on ${d.spaceName}`,
    html: layout(
      `${h1("Your space wasn't approved yet")}
      ${greet(d.organizerName)}
      ${p(`Thanks for submitting ${strong(d.spaceName)}. We can't approve it as it stands.`)}
      ${note(`Reason: ${esc(d.rejectionReason)}`)}
      ${p(`Make the changes and submit again, or write to ${link(SUPPORT, `mailto:${SUPPORT}`)} if anything is unclear.`)}
      ${button('Request a space', `${WEB}/request-space`)}`,
    ),
  };
}

export interface NewSpaceSubmittedData {
  adminEmail: string;
  spaceName: string;
  organizerName: string;
  organizerMobile: string;
  spaceDescription?: string;
  submittedAt: string;
}

export function newSpaceSubmittedEmail(d: NewSpaceSubmittedData): Email {
  return {
    subject: `New space to review: ${d.spaceName}`,
    html: layout(
      `${h1('New space to review')}
      ${details(
        [
          ['Submitted by', esc(d.organizerName)],
          ['Mobile', esc(d.organizerMobile)],
          ['Submitted', esc(d.submittedAt)],
          ['About', d.spaceDescription && esc(d.spaceDescription)],
        ],
        esc(d.spaceName),
      )}
      ${button('Review in Apex', `${APEX}/dashboard/spaces`)}`,
    ),
  };
}

// =====================================================
// SUBSCRIPTIONS
// =====================================================

const BILLING = `${SPACE_APP}/billing`;

export interface SubscriptionActivatedData {
  email: string;
  userName: string;
  plan: string;
  billingCycle: string;
  amount: number;
  expiresAt?: string;
  features: string[];
}

export function subscriptionActivatedEmail(d: SubscriptionActivatedData): Email {
  return {
    subject: `Your ${planName(d.plan)} plan is active`,
    html: layout(
      `${h1(`You're on ${esc(planName(d.plan))}`)}
      ${greet(d.userName)}
      ${p('Your plan is active. Thanks for backing Unifesto.')}
      ${details([
        ['Plan', esc(planName(d.plan))],
        ['Billing', esc(d.billingCycle)],
        ['Amount', inr(d.amount)],
        ['Renews', d.expiresAt && esc(d.expiresAt)],
      ])}
      ${d.features.length ? p(strong('Included')) + list(d.features.map(esc)) : ''}
      ${button('Open billing', BILLING)}`,
    ),
  };
}

export interface SubscriptionCancelledData {
  email: string;
  userName: string;
  plan: string;
  expiresAt: string;
}

export function subscriptionCancelledEmail(d: SubscriptionCancelledData): Email {
  return {
    subject: `Your ${planName(d.plan)} plan is cancelled`,
    html: layout(
      `${h1('Plan cancelled')}
      ${greet(d.userName)}
      ${p(`Your ${strong(planName(d.plan))} plan is cancelled. You keep everything in it until ${strong(d.expiresAt)}, then your space moves to the General plan.`)}
      ${p('Want it back after that? Pick a plan again from billing.')}
      ${button('Open billing', BILLING)}`,
    ),
  };
}

export interface SubscriptionExpiringData {
  email: string;
  userName: string;
  plan: string;
  expiresAt: string;
  renewUrl: string;
}

export function subscriptionExpiringEmail(d: SubscriptionExpiringData): Email {
  return {
    subject: `Your ${planName(d.plan)} plan ends on ${d.expiresAt}`,
    html: layout(
      `${h1('Your plan ends soon')}
      ${greet(d.userName)}
      ${p(`Your ${strong(planName(d.plan))} plan ends on ${strong(d.expiresAt)}. Renew before then to keep every feature without a gap.`)}
      ${button('Renew plan', d.renewUrl)}
      ${small("If you don't renew, your space moves to the Free plan.")}`,
    ),
  };
}

export interface SubscriptionExpiredData {
  email: string;
  userName: string;
  plan: string;
  downgradedTo: string;
}

export function subscriptionExpiredEmail(d: SubscriptionExpiredData): Email {
  return {
    subject: `Your ${planName(d.plan)} plan has ended`,
    html: layout(
      `${h1('Your plan has ended')}
      ${greet(d.userName)}
      ${p(`Your ${strong(planName(d.plan))} plan ended and your space is now on ${strong(planName(d.downgradedTo))}. Your events and data are safe.`)}
      ${button('Renew plan', BILLING)}`,
    ),
  };
}

export interface SubscriptionUpgradedData {
  email: string;
  userName: string;
  fromPlan: string;
  toPlan: string;
  newFeatures: string[];
}

export function subscriptionUpgradedEmail(d: SubscriptionUpgradedData): Email {
  return {
    subject: `You're on ${planName(d.toPlan)} now`,
    html: layout(
      `${h1(`Welcome to ${esc(planName(d.toPlan))}`)}
      ${greet(d.userName)}
      ${p(`You moved from ${strong(planName(d.fromPlan))} to ${strong(planName(d.toPlan))}.`)}
      ${d.newFeatures.length ? p(strong('Now unlocked')) + list(d.newFeatures.map(esc)) : ''}
      ${button('Open billing', BILLING)}`,
    ),
  };
}

export interface SubscriptionDowngradedData {
  email: string;
  userName: string;
  fromPlan: string;
  toPlan: string;
}

export function subscriptionDowngradedEmail(d: SubscriptionDowngradedData): Email {
  return {
    subject: `Your plan changed to ${d.toPlan}`,
    html: layout(
      `${h1('Plan changed')}
      ${greet(d.userName)}
      ${p(`Your space moved from ${strong(d.fromPlan)} to ${strong(d.toPlan)}. Some features may no longer be available.`)}
      ${button('Compare plans', `${WEB}/pricing`)}`,
    ),
  };
}

// =====================================================
// PLATFORM ADMIN DIGESTS
// =====================================================

export interface DailyAdminDigestData {
  adminEmail: string;
  date: string;
  newUsers: number;
  newSpaces: number;
  newEvents: number;
  totalRegistrations: number;
  totalRevenue: number;
  activeUsers: number;
}

const num = (n: number) => Number(n || 0).toLocaleString('en-IN');

export function dailyAdminDigestEmail(d: DailyAdminDigestData): Email {
  return {
    subject: `Daily digest, ${d.date}`,
    html: layout(
      `${h1(`Daily digest`)}
      ${small(esc(d.date))}
      ${details([
        ['New users', num(d.newUsers)],
        ['Active users', num(d.activeUsers)],
        ['New spaces', num(d.newSpaces)],
        ['New events', num(d.newEvents)],
        ['Registrations', num(d.totalRegistrations)],
        ['Revenue', inr(d.totalRevenue)],
      ])}
      ${button('Open Apex', `${APEX}/dashboard`)}`,
    ),
  };
}

export interface WeeklyReportData {
  adminEmail: string;
  weekStarting: string;
  metrics: { label: string; value: string; change: string }[];
}

export function weeklyReportEmail(d: WeeklyReportData): Email {
  return {
    subject: `Weekly report, week of ${d.weekStarting}`,
    html: layout(
      `${h1('Weekly report')}
      ${small(`Week of ${esc(d.weekStarting)}`)}
      ${details(d.metrics.map((m): [string, string] => [m.label, `${esc(m.value)} ${faint(`(${esc(m.change)})`)}`]))}
      ${button('Open analytics', `${APEX}/dashboard`)}`,
    ),
  };
}

export interface MonthlyInvoiceSummaryData {
  adminEmail: string;
  month: string;
  totalRevenue: number;
  totalTransactions: number;
  topEvents: { title: string; revenue: number }[];
}

export function monthlyInvoiceSummaryEmail(d: MonthlyInvoiceSummaryData): Email {
  return {
    subject: `Revenue summary, ${d.month}`,
    html: layout(
      `${h1('Monthly revenue')}
      ${small(esc(d.month))}
      ${details([
        ['Revenue', inr(d.totalRevenue)],
        ['Transactions', num(d.totalTransactions)],
      ])}
      ${d.topEvents.length ? details(d.topEvents.map((e): [string, string] => [e.title, inr(e.revenue)]), 'Top events') : ''}
      ${button('Open financials', `${APEX}/dashboard/financials`)}`,
    ),
  };
}
