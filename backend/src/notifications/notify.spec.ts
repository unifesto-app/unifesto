import { NOTIFY_KINDS } from './notify.kinds';
import { channelsFor } from './notify.policy';
import { NotifyService } from './notify.service';
import { TransactionalNotificationHandler } from './handlers/transactional-notification.handler';

const ctx = { pushAllowed: true, hasPushDevice: true, emailOptedOut: false, hasEmail: true };

describe('channelsFor (notify policy)', () => {
  const critical = { criticality: 'critical' as const, email: () => null };
  const normal = { criticality: 'normal' as const, email: () => null };
  const low = { criticality: 'low' as const, email: () => null };

  it.each([
    ['critical: email always', critical, ctx, { email: 'always' }],
    ['critical: email ignores the opt-out', critical, { ...ctx, emailOptedOut: true }, { email: 'always' }],
    ['critical, no email on file', critical, { ...ctx, hasEmail: false }, { email: 'never' }],
    ['normal, push reachable: email only if push fails', normal, ctx, { email: 'if-push-fails' }],
    ['normal, no push device: email', normal, { ...ctx, hasPushDevice: false }, { email: 'always' }],
    ['normal, push off for category: email', normal, { ...ctx, pushAllowed: false }, { email: 'always' }],
    ['normal, email opted out', normal, { ...ctx, hasPushDevice: false, emailOptedOut: true }, { email: 'never' }],
    ['normal, kind has no email', { criticality: 'normal' as const }, { ...ctx, hasPushDevice: false }, { email: 'never' }],
    ['low: push only', low, { ...ctx, hasPushDevice: false }, { email: 'never' }],
  ])('%s', (_name, kind, c, plan) => {
    expect(channelsFor(kind, c)).toEqual(plan);
  });
});

describe('NotifyService.notify', () => {
  const build = (o: { devices?: number; allowed?: number; optedOut?: boolean; pushSent?: number } = {}) => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          identities: [{ email: 'old@x.co', isPrimary: false }, { email: 'me@x.co', isPrimary: true }],
        }),
      },
      userPushDevice: { count: jest.fn().mockResolvedValue(o.devices ?? 1) },
      notificationSettings: {
        findMany: jest.fn().mockResolvedValue(o.optedOut ? [{ userId: 'u1' }] : []),
      },
    };
    const notifications: any = {
      countAllowed: jest.fn().mockResolvedValue(o.allowed ?? 1),
      send: jest.fn().mockResolvedValue({ sent: o.pushSent ?? 1, failed: o.pushSent === 0 ? 1 : 0, skipped: 0 }),
    };
    const email: any = {
      sendSpaceInquiry: jest.fn().mockResolvedValue(true),
      sendEventCancelled: jest.fn().mockResolvedValue(true),
    };
    return { svc: new NotifyService(prisma, notifications, email), prisma, notifications, email };
  };

  /** A normal kind. */
  const inquiry = { spaceId: 's1', leadId: 'l1', spaceName: 'Club', fromEmail: 'a@x.co', fromName: 'Asha' };
  /** A critical kind. */
  const cancelled = { eventId: 'e1', userName: 'Asha', eventTitle: 'Fest', eventDate: '1 Nov' };

  it('normal kind: push lands, no email', async () => {
    const { svc, email, notifications } = build();
    const res = await svc.notify('u1', 'space.inquiry', inquiry);
    expect(res).toMatchObject({ push: 'sent', email: 'skipped' });
    expect(email.sendSpaceInquiry).not.toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledWith(['u1'], expect.objectContaining({
      category: 'spaceUpdates', kind: 'space.inquiry', dedupKey: 'space.inquiry:l1:u1:push',
    }));
  });

  it('normal kind: falls back to email when the user has no linked push device', async () => {
    const { svc, email } = build({ devices: 0 });
    const res = await svc.notify('u1', 'space.inquiry', inquiry);
    expect(res.email).toBe('sent');
    expect(email.sendSpaceInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'me@x.co', spaceName: 'Club' }),
      { kind: 'space.inquiry', userId: 'u1', dedupKey: 'space.inquiry:l1:u1:email' },
    );
  });

  it('normal kind: falls back to email when the push did not land', async () => {
    const { svc, email } = build({ pushSent: 0 });
    expect((await svc.notify('u1', 'space.inquiry', inquiry)).email).toBe('sent');
    expect(email.sendSpaceInquiry).toHaveBeenCalled();
  });

  it('normal kind: respects the email opt-out', async () => {
    const { svc, email } = build({ devices: 0, optedOut: true });
    expect((await svc.notify('u1', 'space.inquiry', inquiry)).email).toBe('skipped');
    expect(email.sendSpaceInquiry).not.toHaveBeenCalled();
  });

  it('critical kind: push + email (despite opt-out), each with its own dedup key', async () => {
    const { svc, email, notifications } = build({ optedOut: true });
    const res = await svc.notify('u1', 'event.cancelled', cancelled);
    expect(res).toMatchObject({ push: 'sent', email: 'sent' });
    expect(notifications.send.mock.calls[0][1].dedupKey).toBe('event.cancelled:e1:u1:push');
    expect(email.sendEventCancelled.mock.calls[0][1].dedupKey).toBe('event.cancelled:e1:u1:email');
  });

  it('inboxOnly kind (payment.confirmed): inbox copy, no device push, receipt email always', async () => {
    const { svc, notifications, email } = build();
    email.sendPaymentConfirmation = jest.fn().mockResolvedValue(true);
    notifications.send.mockResolvedValue({ sent: 0, failed: 0, skipped: 1 });
    const res = await svc.notify('u1', 'payment.confirmed', {
      ...cancelled, eventTime: '10 AM', isOnline: false, amount: 100, processingFee: 5, razorpayPaymentId: 'pay_1',
    } as any);
    expect(notifications.send).toHaveBeenCalledWith(['u1'], expect.objectContaining({
      inboxOnly: true, title: 'Payment received', dedupKey: 'payment.confirmed:pay_1:u1:push',
    }));
    expect(res).toMatchObject({ push: 'skipped', email: 'sent' });
    expect(email.sendPaymentConfirmation.mock.calls[0][1].dedupKey).toBe('payment.confirmed:pay_1:u1:email');
  });

  it('only payment.confirmed is inbox-only; event.updated is critical (email always)', () => {
    const inboxOnly = Object.entries(NOTIFY_KINDS).filter(([, d]) => (d as any).inboxOnly).map(([k]) => k);
    expect(inboxOnly).toEqual(['payment.confirmed']);
    expect(NOTIFY_KINDS['event.updated'].criticality).toBe('critical');
  });

  it('space.approved dedups per approval, so a later re-approval is told again', () => {
    const d = { spaceId: 's1', organizerName: 'A', spaceName: 'S', spaceSlug: 's' };
    const a = NOTIFY_KINDS['space.approved'].entity({ ...d, approvedAt: new Date(1000) });
    const b = NOTIFY_KINDS['space.approved'].entity({ ...d, approvedAt: new Date(2000) });
    expect(a).toBe('s1:1000');
    expect(b).not.toBe(a);
  });

  it('quiet hours (C4): critical kinds go out as urgent, others may wait', async () => {
    const { svc, notifications } = build();
    await svc.notify('u1', 'space.inquiry', inquiry);
    await svc.notify('u1', 'event.cancelled', cancelled);
    expect(notifications.send.mock.calls.map((c: any[]) => !!c[1].urgent)).toEqual([false, true]);
  });

  it('caller dedupKey replaces the default base', async () => {
    const { svc, notifications } = build();
    await svc.notify('u1', 'space.inquiry', inquiry, { dedupKey: 'custom' });
    expect(notifications.send.mock.calls[0][1].dedupKey).toBe('custom:push');
  });

  it('never throws: a failing channel or lookup becomes a result', async () => {
    const a = build({ devices: 0 });
    a.email.sendSpaceInquiry.mockRejectedValue(new Error('boom'));
    await expect(a.svc.notify('u1', 'space.inquiry', inquiry)).resolves.toMatchObject({ email: 'failed' });

    const b = build();
    b.prisma.user.findUnique.mockRejectedValue(new Error('db down'));
    await expect(b.svc.notify('u1', 'space.inquiry', inquiry)).resolves.toMatchObject({
      push: 'skipped', email: 'skipped',
    });
  });
});

describe('stay kinds (C2)', () => {
  const base = { bookingId: 'b-1', eventId: 'ev-1', userName: 'Asha', stayName: 'Hostel' };

  it.each([
    ['stay.payment_due', { amountText: '₹500', dueText: '2 Dec' }, 'Stay request approved', 'Pay ₹500 by 2 Dec to confirm your bed at Hostel.'],
    ['stay.confirmed', { note: 'Pay ₹500 at check-in.' }, 'Your stay is confirmed', 'Your Stay Pass for Hostel is ready. Pay ₹500 at check-in.'],
    ['stay.declined', {}, 'Stay request declined', "Hostel: the event team couldn't fit you in this time."],
    ['stay.cancelled', { reason: 'Flooded', refundText: '₹500' }, 'Your stay was cancelled', 'Hostel: Flooded. ₹500 is being refunded (5–7 days).'],
    ['stay.refunded', { amountText: '₹1,020' }, 'Stay payment refunded', 'Your payment for Hostel arrived after the booking closed, so ₹1,020 is on its way back.'],
    ['stay.expired', {}, 'Stay payment window closed', "Your bed at Hostel was released because it wasn't paid in time."],
  ] as const)('%s: critical, deduped per booking, email says the push words', async (kind, extra, title, body) => {
    const def: any = NOTIFY_KINDS[kind];
    const d = { ...base, ...extra };
    expect(def.criticality).toBe('critical');
    expect(def.entity(d)).toBe('b-1');
    expect(def.push(d)).toMatchObject({ title, body, deepLink: 'unifesto://stay/pass/b-1' });
    const svc = { sendStayUpdate: jest.fn().mockResolvedValue(true) };
    await def.email(svc, 'a@x.co', d, {});
    expect(svc.sendStayUpdate).toHaveBeenCalledWith(
      { email: 'a@x.co', eventId: 'ev-1', userName: 'Asha', title, body },
      {},
    );
  });
});

describe('NotifyBatch bus handler', () => {
  it('calls notify() once per person, in turn, with the caller key', async () => {
    const order: string[] = [];
    const notify: any = { notify: jest.fn(async (u: string) => { order.push(u); return {}; }) };
    const handler = new TransactionalNotificationHandler({} as any, {} as any, notify);
    await handler.onNotifyBatch({
      kind: 'event.updated',
      items: [
        { userId: 'u1', data: { x: 1 } as any, dedupKey: 'k1' },
        { userId: 'u2', data: { x: 2 } as any },
      ],
    });
    expect(order).toEqual(['u1', 'u2']);
    expect(notify.notify).toHaveBeenCalledWith('u1', 'event.updated', { x: 1 }, { dedupKey: 'k1' });
    expect(notify.notify).toHaveBeenCalledWith('u2', 'event.updated', { x: 2 }, { dedupKey: undefined });
  });
});

describe('Q10: booking pushes open the pass', () => {
  const booking = { eventId: 'e1', eventSlug: 'demo-day', eventTitle: 'Demo Day' } as never;

  it('payment.confirmed opens the ticket', () => {
    expect(NOTIFY_KINDS['payment.confirmed'].push(booking).deepLink).toBe('unifesto://ticket/e1');
  });

  it('a waitlist offer opens the Pay card on the Waitlist tab', () => {
    expect(NOTIFY_KINDS['waitlist.offer'].push(booking).deepLink).toBe('unifesto://tickets?tab=waitlist');
  });
});
