import { NOTIFY_KINDS } from '../notifications/notify.kinds';
import { AUTOMATIONS, SWITCHABLE, automationOn } from './automations';
import { AutomationsService } from './automations.service';

describe('automation list (C18)', () => {
  it('names every notify() kind, each key once', () => {
    const counted = new Set(AUTOMATIONS.flatMap((a) => a.kinds));
    expect(Object.keys(NOTIFY_KINDS).filter((k) => !counted.has(k))).toEqual([]);
    const keys = AUTOMATIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only the owner's four can be switched off per event (feedback keeps its own switch)", () => {
    expect(SWITCHABLE.sort()).toEqual(['checkout.unpaid', 'event.reminder', 'event.starting_soon', 'event.summary']);
    expect(AUTOMATIONS.find((a) => a.key === 'feedback')?.switchable).toBe('feedback');
    expect(automationOn({ automationsOff: ['event.summary'] }, 'event.summary')).toBe(false);
    expect(automationOn({ automationsOff: [] }, 'event.reminder')).toBe(true);
  });
});

describe('AutomationsService', () => {
  const build = (event = { automationsOff: [] as string[], feedbackEnabled: true }) => {
    const prisma: any = {
      messageDelivery: {
        groupBy: jest.fn().mockResolvedValue([
          { kind: 'event.reminder', channel: 'EMAIL', status: 'DELIVERED', _count: { _all: 40 } },
          { kind: 'event.reminder', channel: 'PUSH', status: 'SENT', _count: { _all: 55 } },
          { kind: 'seat.claimed', channel: 'EMAIL', status: 'SENT', _count: { _all: 2 } },
          { kind: 'seat.declined', channel: 'EMAIL', status: 'SENT', _count: { _all: 1 } },
        ]),
      },
      event: {
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { svc: new AutomationsService(prisma), prisma };
  };

  it('counts each automation per channel, folding its kinds together', async () => {
    const { svc, prisma } = build();
    const { automations, days } = await svc.list(500);
    expect(days).toBe(90);
    const byKey = Object.fromEntries(automations.map((a) => [a.key, a.counts]));
    expect(byKey['event.reminder']).toEqual({ email: { DELIVERED: 40 }, push: { SENT: 55 } });
    expect(byKey['seat.lead']).toEqual({ email: { SENT: 3 } });
    expect(byKey['payment.failed']).toEqual({});
    expect(prisma.messageDelivery.groupBy.mock.calls[0][0].where.kind.in).toContain('certificate.issued');
  });

  it("switches one off for an event and back on, and feedback flips the event's own switch", async () => {
    const off = build({ automationsOff: ['event.summary'], feedbackEnabled: true });
    await off.svc.setForEvent('e1', 'event.reminder', false);
    expect(off.prisma.event.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { automationsOff: ['event.summary', 'event.reminder'] } });
    await off.svc.setForEvent('e1', 'event.summary', true);
    expect(off.prisma.event.update).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { automationsOff: [] } });
    await off.svc.setForEvent('e1', 'feedback', false);
    expect(off.prisma.event.update).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { feedbackEnabled: false } });
    await expect(off.svc.setForEvent('e1', 'registration.confirmed', false)).rejects.toThrow("can't be switched off");
  });

  it("lists an event's switches with whether each is on", async () => {
    const { svc } = build({ automationsOff: ['checkout.unpaid'], feedbackEnabled: false });
    const list = await svc.forEvent('e1');
    expect(Object.fromEntries(list.map((a) => [a.key, a.on]))).toEqual({
      'checkout.unpaid': false,
      'event.reminder': true,
      'event.starting_soon': true,
      feedback: false,
      'event.summary': true,
    });
  });
});
