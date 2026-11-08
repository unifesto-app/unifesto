/**
 * C18: every automatic message Unifesto sends, in one list. The messages
 * themselves stay in code where they are sent; this only names them, says
 * when and on which channels they go, and which message_deliveries kinds
 * count them. A new automatic send adds its row here.
 */

export type AutomationChannel = 'push' | 'inapp' | 'email' | 'whatsapp';

export interface Automation {
  key: string;
  name: string;
  /** When it goes, in words. */
  when: string;
  to: string;
  group: 'Booking' | 'Before the event' | 'After the event' | 'Waitlist' | 'Group bookings' | 'Refunds' | 'Hackathons' | 'Organisers';
  channels: AutomationChannel[];
  /** message_deliveries kinds that count it (in-app copies have no rows). */
  kinds: string[];
  /** event: managers can switch it off for one event (Event.automationsOff); feedback: Event.feedbackEnabled. */
  switchable?: 'event' | 'feedback';
}

export const AUTOMATIONS: Automation[] = [
  // Booking
  { key: 'registration.confirmed', name: 'Booking confirmation', when: 'When a booking is confirmed', to: 'The attendee and their group', group: 'Booking', channels: ['push', 'inapp', 'email', 'whatsapp'], kinds: ['registration.confirmed'] },
  { key: 'payment.confirmed', name: 'Payment receipt', when: 'When a payment goes through', to: 'The payer', group: 'Booking', channels: ['inapp', 'email'], kinds: ['payment.confirmed'] },
  { key: 'payment.failed', name: 'Payment failed', when: 'When Razorpay reports a failed payment', to: 'The payer', group: 'Booking', channels: ['email'], kinds: ['payment.failed'] },
  { key: 'checkout.unpaid', name: 'Unpaid checkout nudge', when: 'About 45 minutes after a checkout is left unpaid', to: 'The person who started it', group: 'Booking', channels: ['push', 'inapp'], kinds: ['checkout.unpaid'], switchable: 'event' },
  { key: 'registration.group_invite', name: 'WhatsApp group invite', when: 'On booking, and when the organiser sets the group link', to: 'Attendees with a number', group: 'Booking', channels: ['whatsapp'], kinds: ['registration.group_invite'] },
  { key: 'registration.cancelled', name: 'Booking cancelled', when: 'When a booking is cancelled', to: 'The attendee and their group', group: 'Booking', channels: ['push', 'inapp', 'email'], kinds: ['registration.cancelled'] },
  // Before the event
  { key: 'event.reminder', name: 'Day-before reminder', when: 'About 24 hours before the start', to: 'Attendees, and "Notify me" leads by email', group: 'Before the event', channels: ['push', 'inapp', 'email'], kinds: ['event.reminder'], switchable: 'event' },
  { key: 'event.starting_soon', name: 'Starting soon', when: 'About an hour before the start', to: 'Attendees', group: 'Before the event', channels: ['email'], kinds: ['event.starting_soon'], switchable: 'event' },
  { key: 'event.updated', name: 'Time or venue changed', when: 'When a published event moves', to: 'Attendees and "Notify me" leads', group: 'Before the event', channels: ['push', 'inapp', 'email'], kinds: ['event.updated'] },
  { key: 'event.cancelled', name: 'Event cancelled', when: 'When the organiser cancels', to: 'Attendees', group: 'Before the event', channels: ['push', 'inapp', 'email'], kinds: ['event.cancelled'] },
  { key: 'event.published', name: 'New event in your space', when: 'When an event is published', to: "The space's members", group: 'Before the event', channels: ['push', 'inapp', 'email'], kinds: ['event.published'] },
  { key: 'lead.interest', name: '"Notify me" updates', when: 'With the day-before reminder and time or venue changes', to: 'People who tapped Notify me', group: 'Before the event', channels: ['email'], kinds: ['lead.interest'] },
  // After the event
  { key: 'feedback', name: 'Feedback ask and reminder', when: '2 hours and 48 hours after the end', to: 'Checked-in attendees who have not answered', group: 'After the event', channels: ['push', 'inapp'], kinds: ['feedback.request', 'feedback.reminder'], switchable: 'feedback' },
  { key: 'event.summary', name: 'Post-event summary', when: 'A couple of hours after the end', to: 'Checked-in attendees', group: 'After the event', channels: ['email'], kinds: ['event.summary'], switchable: 'event' },
  { key: 'certificate.issued', name: 'Certificate', when: 'When the organiser issues certificates, or after feedback if they asked for it', to: 'Certificate holders', group: 'After the event', channels: ['email'], kinds: ['certificate.issued'] },
  // Waitlist
  { key: 'waitlist.joined', name: 'On the waitlist', when: 'When someone joins the waitlist', to: 'That person', group: 'Waitlist', channels: ['email'], kinds: ['waitlist.joined'] },
  { key: 'waitlist.offer', name: 'A spot opened up', when: 'When a seat is offered', to: 'That person', group: 'Waitlist', channels: ['push', 'inapp', 'email'], kinds: ['waitlist.offer'] },
  { key: 'waitlist.revoked', name: 'Offer withdrawn', when: 'When an offer lapses or is taken back', to: 'That person', group: 'Waitlist', channels: ['email'], kinds: ['waitlist.revoked'] },
  // Group bookings
  { key: 'seat.invite', name: 'Seat invite', when: 'When a lead invites a teammate', to: 'The teammate', group: 'Group bookings', channels: ['email'], kinds: ['seat.invite'] },
  { key: 'seat.reminder', name: 'Claim your seat', when: '48 hours before, if the seat is unclaimed', to: 'The invited teammate', group: 'Group bookings', channels: ['email'], kinds: ['seat.reminder'] },
  { key: 'seat.lead', name: 'Seat news for the lead', when: 'When a seat is claimed or declined', to: 'The group lead', group: 'Group bookings', channels: ['email'], kinds: ['seat.claimed', 'seat.declined'] },
  { key: 'seat.replaced', name: 'Seat given to someone else', when: 'When the lead replaces a member', to: 'The member who lost it', group: 'Group bookings', channels: ['email'], kinds: ['seat.replaced'] },
  // Refunds
  { key: 'refund.requested', name: 'Refund request received', when: 'When an attendee asks for a refund', to: 'The attendee, and the organiser to review', group: 'Refunds', channels: ['email'], kinds: ['refund.requested', 'refund.review'] },
  { key: 'refund.approved', name: 'Refund approved', when: 'When a refund is sent', to: 'Everyone who paid', group: 'Refunds', channels: ['push', 'inapp', 'email'], kinds: ['refund.approved'] },
  { key: 'refund.declined', name: 'Refund declined', when: 'When a refund request is turned down', to: 'The attendee', group: 'Refunds', channels: ['push', 'inapp', 'email'], kinds: ['refund.declined'] },
  // Hackathons
  { key: 'hackathon.update', name: 'Team updates', when: 'Team formed, round open, results and similar', to: 'Hackathon teams', group: 'Hackathons', channels: ['push', 'inapp'], kinds: ['hackathon.update', 'competition.update'] },
  { key: 'hackathon.judge_update', name: 'Judge updates', when: 'Judging opens, time up, winners announced', to: 'Judges', group: 'Hackathons', channels: ['push', 'inapp'], kinds: ['hackathon.judge_update'] },
  // Organisers
  { key: 'space.review', name: 'Space approved or not', when: 'When Unifesto reviews a space', to: 'The space owner', group: 'Organisers', channels: ['push', 'inapp', 'email'], kinds: ['space.approved', 'space.rejected'] },
  { key: 'space.status', name: 'Space paused, suspended or archived', when: 'When the space status changes, or archiving is 14 days away', to: 'The space owner', group: 'Organisers', channels: ['push', 'inapp', 'email'], kinds: ['space.status', 'space.archive_warning'] },
  { key: 'space.quiet', name: 'No events lately', when: 'When a space has had no event for 2 months', to: 'Space admins', group: 'Organisers', channels: ['push', 'inapp', 'email'], kinds: ['space.quiet'] },
  { key: 'space.inquiry', name: 'New inquiry', when: 'When someone writes from the public space page', to: 'Space admins', group: 'Organisers', channels: ['push', 'inapp', 'email'], kinds: ['space.inquiry'] },
];

/** Automations an event's managers can switch off for that event alone. */
export const SWITCHABLE = AUTOMATIONS.filter((a) => a.switchable === 'event').map((a) => a.key);

/** Whether `key` still goes out for an event (its managers didn't switch it off). No list = all on. */
export const automationOn = (event: { automationsOff?: string[] | null }, key: string) => !event.automationsOff?.includes(key);
