/**
 * A push category maps 1:1 to a boolean column on `NotificationSettings`, so the
 * send path can honour a user's opt-out with a single lookup. The global
 * `pushEnabled` switch gates all of them.
 */
export type NotificationCategory =
  | 'registrationUpdates'
  | 'eventReminders'
  | 'newEvents'
  | 'spaceUpdates'
  | 'referralUpdates'
  | 'promotions' // admin marketing broadcasts (opt-IN: off by default)
  | 'productUpdates' // admin product/app announcements (opt-OUT: on by default)
  | 'organiserAnnouncements'
  | 'adminAlerts'; // platform-staff operational alerts (no settings column)

/**
 * Domain event names on the in-process bus. Domain services emit these; the
 * notifications handlers listen. Namespaced so they never collide with other
 * emitters.
 */
export const NotificationEvents = {
  RegistrationConfirmed: 'notif.registration.confirmed',
  WaitlistOffer: 'notif.waitlist.offer',
  NewEvent: 'notif.event.new',
  WhatsappInbound: 'notif.whatsapp.inbound',
  CompetitionUpdate: 'notif.competition.update',
  StatusIncident: 'notif.status.incident',
} as const;
