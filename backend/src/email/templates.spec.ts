import * as T from './templates';

const evil = '<script>x</script>';
const event = {
  email: 'a@b.co',
  userName: evil,
  eventTitle: evil,
  eventDate: 'Sat, 18 Oct 2026',
  eventTime: '6:00 PM to 9:00 PM',
  venueName: 'T-Hub',
  city: 'Hyderabad',
  isOnline: false,
  qrCode: 'REG-123',
  ticketCode: 'UF-7Q2K',
};

/** One sample per template; exported so the preview script can reuse it. */
export const samples: Record<string, T.Email> = {
  otp: T.otpEmail('482913'),
  welcome: T.welcomeEmail(evil),
  signInMethodAdded: T.signInMethodAddedEmail(evil),
  registration: T.registrationConfirmationEmail({ ...event, eventSlug: 'demo-day' }),
  payment: T.paymentConfirmationEmail({ ...event, amount: 1499, processingFee: 45, razorpayPaymentId: 'pay_123' }),
  cancellation: T.cancellationConfirmationEmail({ ...event, organiserReason: evil, razorpayRefundInitiated: true, razorpayRefundAmount: 1499 }),
  reminder: T.eventReminderEmail(event),
  startingSoon: T.eventStartingSoonEmail({ ...event, startsInMinutes: 60 }),
  eventCancelled: T.eventCancelledEmail({ ...event, cancellationReason: evil, refundInfo: 'Refunds go out in 5 to 7 days.' }),
  eventUpdated: T.eventUpdatedEmail({ ...event, changes: [{ field: 'Venue', oldValue: 'T-Hub', newValue: evil }] }),
  eventPublished: T.eventPublishedEmail({ ...event, spaceName: evil, registrationUrl: 'https://unifesto.app/event/x' }),
  eventSummary: T.eventSummaryEmail({ ...event, attendeeCount: 1240, photosUrl: 'https://x.co' }),
  waitlist: T.waitlistConfirmationEmail({ ...event, waitlistPosition: 4 }),
  waitlistPaid: T.waitlistPromotedEmail({ ...event, registrationUrl: 'https://x.co', expiresInHours: 24, amountDue: 499 }),
  waitlistFree: T.waitlistPromotedEmail({ ...event, registrationUrl: 'https://x.co', expiresInHours: null, amountDue: 0 }),
  waitlistRevoked: T.waitlistRevokedEmail({ ...event, registrationUrl: 'https://x.co' }),
  paymentFailed: T.paymentFailedEmail({ ...event, amount: 499, reason: evil, retryUrl: 'https://x.co' }),
  bankRejected: T.bankAccountRejectedEmail({ email: 'a@b.co', userName: evil, bankName: 'HDFC', accountNumber: '4321', rejectionReason: evil }),
  certificate: T.certificateIssuedEmail({ email: 'a@b.co', recipientName: evil, eventTitle: evil, issuerName: evil, certificateNumber: 'UF-2026-0001', verifyUrl: 'https://unifesto.app/verify/x', pdfUrl: 'https://x.co/c.pdf' }),
  spaceApproved: T.spaceApprovedEmail({ email: 'a@b.co', organizerName: evil, spaceName: evil, spaceSlug: 'gdg-hyd' }),
  spaceRejected: T.spaceRejectedEmail({ email: 'a@b.co', organizerName: evil, spaceName: evil, rejectionReason: evil }),
  spaceSubmitted: T.newSpaceSubmittedEmail({ adminEmail: 'a@b.co', spaceName: evil, organizerName: evil, organizerMobile: '+91 90000 00000', submittedAt: '9 Oct 2026' }),
  subActivated: T.subscriptionActivatedEmail({ email: 'a@b.co', userName: evil, plan: 'PRO', billingCycle: 'Yearly', amount: 11999, expiresAt: '9 Oct 2027', features: [evil, 'Certificates'] }),
  subCancelled: T.subscriptionCancelledEmail({ email: 'a@b.co', userName: evil, plan: 'PRO', expiresAt: '9 Nov 2026' }),
  subExpiring: T.subscriptionExpiringEmail({ email: 'a@b.co', userName: evil, plan: 'PRO', expiresAt: '16 Oct 2026', renewUrl: 'https://x.co' }),
  subExpired: T.subscriptionExpiredEmail({ email: 'a@b.co', userName: evil, plan: 'PRO', downgradedTo: 'FREE' }),
  subUpgraded: T.subscriptionUpgradedEmail({ email: 'a@b.co', userName: evil, fromPlan: 'FREE', toPlan: 'PRO', newFeatures: [evil] }),
  subDowngraded: T.subscriptionDowngradedEmail({ email: 'a@b.co', userName: evil, fromPlan: 'PRO', toPlan: 'FREE' }),
  daily: T.dailyAdminDigestEmail({ adminEmail: 'a@b.co', date: '9 Oct 2026', newUsers: 120, newSpaces: 3, newEvents: 9, totalRegistrations: 840, totalRevenue: 125000, activeUsers: 4200 }),
  weekly: T.weeklyReportEmail({ adminEmail: 'a@b.co', weekStarting: '5 Oct 2026', metrics: [{ label: 'Users', value: '1,200', change: '+8%' }] }),
  monthly: T.monthlyInvoiceSummaryEmail({ adminEmail: 'a@b.co', month: 'September 2026', totalRevenue: 980000, totalTransactions: 3100, topEvents: [{ title: evil, revenue: 200000 }] }),
};

describe('email templates', () => {
  it.each(Object.entries(samples))('%s escapes user text and leaks no blanks', (_name, { subject, html }) => {
    expect(subject.length).toBeGreaterThan(0);
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/\bundefined\b|>null</);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('never puts the ticket token in the html (J15)', () => {
    for (const { html } of Object.values(samples)) expect(html).not.toMatch(/qrserver|REG-123/);
  });

  it('never asks for payment on a free waitlist spot', () => {
    expect(samples.waitlistFree.html).not.toContain('Pay and confirm');
    expect(samples.waitlistPaid.html).toContain('Pay and confirm');
  });
});

describe('J15 check-in QR', () => {
  it.each(['registration', 'payment', 'reminder', 'startingSoon'])('%s hands the QR payload to EmailService', (name) => {
    expect(samples[name].qr).toBe('REG-123');
    expect(samples[name].html).toContain('src="cid:checkin-qr"');
  });

  it('skips the QR when an online join link replaces it', () => {
    const online = T.eventStartingSoonEmail({ ...event, isOnline: true, onlineUrl: 'https://meet.x/y', startsInMinutes: 15 });
    expect(online.qr).toBeUndefined();
    expect(online.html).not.toContain('cid:checkin-qr');
  });
});

describe('H23 app line', () => {
  const brand = { name: 'GDG Hyd', logoUrl: null, color: '#112233', hidePoweredBy: false, url: 'https://unifesto.app/space/gdg', webBase: 'https://unifesto.app' };
  const reg = (b?: typeof brand) => T.registrationConfirmationEmail({ ...event, eventSlug: 'demo-day', brand: b }).html;

  it('keeps the current line on unbranded registration mail', () => {
    expect(reg()).toContain('Your ticket is also in the Unifesto app.');
  });

  it('uses the neutral line on branded registration mail', () => {
    expect(reg(brand)).toContain('You can also find your ticket in the Unifesto app.');
    expect(reg(brand)).not.toContain('Your ticket is also in the Unifesto app.');
  });

  it('applies the same rule to stay updates', () => {
    const stay = (b?: typeof brand) => T.stayUpdateEmail({ email: 'a@b.co', userName: 'A', title: 't', body: 'b', brand: b }).html;
    expect(stay()).toContain('Your Stay Pass and booking details are in the Unifesto app.');
    expect(stay(brand)).toContain('You can also find your Stay Pass and booking details in the Unifesto app.');
  });
});
