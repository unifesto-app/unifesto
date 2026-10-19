import { NOTIFY_KINDS } from './notify.kinds';
import { channelsFor } from './notify.policy';
import { NotifyService } from './notify.service';
import { TransactionalNotificationHandler } from './handlers/transactional-notification.handler';

const ctx = { pushAllowed: true, hasPushDevice: true, emailOptedOut: false, hasEmail: true, hasPhone: true };

describe('channelsFor (notify policy)', () => {
  const critical = { criticality: 'critical' as const, email: () => null };
  const criticalWa = { ...critical, whatsapp: () => null };
  const normal = { criticality: 'normal' as const, email: () => null };
  const low = { criticality: 'low' as const, email: () => null };

  it.each([
    ['critical: email always, no WhatsApp unless allowed', critical, ctx, { email: 'always', whatsapp: false }],
    ['critical: email ignores the opt-out', critical, { ...ctx, emailOptedOut: true }, { email: 'always', whatsapp: false }],
    ['critical + WhatsApp-allowed kind', criticalWa, ctx, { email: 'always', whatsapp: true }],
    ['critical + WhatsApp but no phone', criticalWa, { ...ctx, hasPhone: false }, { email: 'always', whatsapp: false }],
    ['critical, no email on file', critical, { ...ctx, hasEmail: false }, { email: 'never', whatsapp: false }],
    ['normal, push reachable: email only if push fails', normal, ctx, { email: 'if-push-fails', whatsapp: false }],
    ['normal, no push device: email', normal, { ...ctx, hasPushDevice: false }, { email: 'always', whatsapp: false }],
    ['normal, push off for category: email', normal, { ...ctx, pushAllowed: false }, { email: 'always', whatsapp: false }],
    ['normal, email opted out', normal, { ...ctx, hasPushDevice: false, emailOptedOut: true }, { email: 'never', whatsapp: false }],
    ['normal, kind has no email', { criticality: 'normal' as const }, { ...ctx, hasPushDevice: false }, { email: 'never', whatsapp: false }],
    ['low: push only', low, { ...ctx, hasPushDevice: false }, { email: 'never', whatsapp: false }],
  ])('%s', (_name, kind, c, plan) => {
    expect(channelsFor(kind, c)).toEqual(plan);
  });

  it('only registration.confirmed may use WhatsApp (cost decision)', () => {
    const wa = Object.entries(NOTIFY_KINDS).filter(([, d]) => 'whatsapp' in d).map(([k]) => k);
    expect(wa).toEqual(['registration.confirmed']);
  });
});

describe('NotifyService.notify', () => {
  const build = (o: { devices?: number; allowed?: number; optedOut?: boolean; pushSent?: number } = {}) => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          mobileNumber: '+919999999999',
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
      sendEventReminder: jest.fn().mockResolvedValue(true),
      sendRegistrationConfirmation: jest.fn().mockResolvedValue(true),
    };
    const whatsapp: any = { sendRegistrationConfirmation: jest.fn().mockResolvedValue(true) };
    return { svc: new NotifyService(prisma, notifications, email, whatsapp), prisma, notifications, email, whatsapp };
  };

  const reminder = {
    eventId: 'e1', eventSlug: 'fest', userName: 'Asha', eventTitle: 'Fest', eventDate: '1 Nov',
    eventTime: '10 AM', qrCode: 'q', isOnline: false,
  };
  const confirmed = { ...reminder, registrationId: 'r1' };

  it('normal kind: push lands, no email', async () => {
    const { svc, email, notifications } = build();
    const res = await svc.notify('u1', 'event.reminder.24h', reminder);
    expect(res).toMatchObject({ push: 'sent', email: 'skipped', whatsapp: 'skipped' });
    expect(email.sendEventReminder).not.toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledWith(['u1'], expect.objectContaining({
      category: 'eventReminders', kind: 'event.reminder.24h', dedupKey: 'event.reminder.24h:e1:u1:push',
    }));
  });

  it('normal kind: falls back to email when the user has no linked push device', async () => {
    const { svc, email } = build({ devices: 0 });
    const res = await svc.notify('u1', 'event.reminder.24h', reminder);
    expect(res.email).toBe('sent');
    expect(email.sendEventReminder).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'me@x.co', eventTitle: 'Fest' }),
      { kind: 'event.reminder.24h', userId: 'u1', dedupKey: 'event.reminder.24h:e1:u1:email' },
    );
  });

  it('normal kind: falls back to email when the push did not land', async () => {
    const { svc, email } = build({ pushSent: 0 });
    expect((await svc.notify('u1', 'event.reminder.24h', reminder)).email).toBe('sent');
    expect(email.sendEventReminder).toHaveBeenCalled();
  });

  it('normal kind: respects the email opt-out', async () => {
    const { svc, email } = build({ devices: 0, optedOut: true });
    expect((await svc.notify('u1', 'event.reminder.24h', reminder)).email).toBe('skipped');
    expect(email.sendEventReminder).not.toHaveBeenCalled();
  });

  it('critical kind: push + email (despite opt-out) + WhatsApp, each with its own dedup key', async () => {
    const { svc, email, whatsapp } = build({ optedOut: true });
    const res = await svc.notify('u1', 'registration.confirmed', confirmed);
    expect(res).toMatchObject({ push: 'sent', email: 'sent', whatsapp: 'sent' });
    expect(email.sendRegistrationConfirmation.mock.calls[0][1].dedupKey).toBe('registration.confirmed:r1:u1:email');
    expect(whatsapp.sendRegistrationConfirmation).toHaveBeenCalledWith(
      '+919999999999',
      expect.objectContaining({ eventTitle: 'Fest' }),
      expect.objectContaining({ dedupKey: 'registration.confirmed:r1:u1:whatsapp' }),
    );
  });

  it('caller dedupKey replaces the default base', async () => {
    const { svc, notifications } = build();
    await svc.notify('u1', 'event.reminder.24h', reminder, { dedupKey: 'custom' });
    expect(notifications.send.mock.calls[0][1].dedupKey).toBe('custom:push');
  });

  it('never throws: a failing channel or lookup becomes a result', async () => {
    const a = build({ devices: 0 });
    a.email.sendEventReminder.mockRejectedValue(new Error('boom'));
    await expect(a.svc.notify('u1', 'event.reminder.24h', reminder)).resolves.toMatchObject({ email: 'failed' });

    const b = build();
    b.prisma.user.findUnique.mockRejectedValue(new Error('db down'));
    await expect(b.svc.notify('u1', 'event.reminder.24h', reminder)).resolves.toMatchObject({
      push: 'skipped', email: 'skipped', whatsapp: 'skipped',
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
