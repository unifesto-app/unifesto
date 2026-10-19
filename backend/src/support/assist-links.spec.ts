import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubjectCases, SUBJECT_CASE_OPEN } from './subject-cases';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { HackathonHelpService } from '../leaderboard/hackathon-help.service';

/**
 * D26 + D27: a WhatsApp conversation and a hackathon help query each become one
 * Assist case through the real SubjectCases listener, on the right desk, and a
 * second click returns the same case.
 */
describe('Assist links (D26, D27)', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  /** An in-memory support_tickets table behind the real SubjectCases, wired to an emitter. */
  function caseStore(prisma: any) {
    const tickets: any[] = [];
    prisma.supportTicket = {
      findFirst: jest.fn(async ({ where }) => tickets.find((t) => t.subjectType === where.subjectType && t.subjectId === where.subjectId) ?? null),
      create: jest.fn(async ({ data }) => {
        const t = { id: `case-${tickets.length + 1}`, ...data };
        tickets.push(t);
        return { id: t.id };
      }),
    };
    const events = new EventEmitter2();
    const cases = new SubjectCases(prisma, events);
    events.on(SUBJECT_CASE_OPEN, (e) => cases.onOpen(e));
    return { tickets, events };
  }

  describe('D26: WhatsApp convert to case', () => {
    const config = { get: (k: string) => ({ WHATSAPP_PHONE_NUMBER_ID: 'pn', WHATSAPP_ACCESS_TOKEN: 'tok' })[k as 'WHATSAPP_PHONE_NUMBER_ID'] };

    function setup(user: { id: string } | null) {
      const conv: any = { id: 'conv-1', waId: '919876543210', profileName: 'Asha', userId: null, caseId: null };
      const prisma: any = {
        whatsappConversation: {
          findUnique: jest.fn(async () => ({ ...conv })),
          update: jest.fn(async ({ data }) => Object.assign(conv, data)),
        },
        whatsappMessage: {
          findMany: jest.fn(async () => [
            { id: 'm1', type: 'text', body: 'My ticket QR is not loading', mediaNote: null, mediaUrl: null },
            { id: 'm2', type: 'image', body: null, mediaNote: '[image]', mediaUrl: 'https://s3/x.jpg' },
          ]),
        },
        user: { findFirst: jest.fn(async () => user) },
      };
      const { tickets, events } = caseStore(prisma);
      const svc = new WhatsAppService(config as any, prisma, {} as any, events, {} as any);
      return { svc, prisma, tickets, conv };
    }

    it('opens one Platform HELP case for the matched account, and a second click returns it', async () => {
      const { svc, prisma, tickets, conv } = setup({ id: 'user-1' });
      const first = await svc.convertToCase('conv-1', 'admin-1', ['m1', 'm2']);
      const again = await svc.convertToCase('conv-1', 'admin-1', ['m1']);

      expect(first).toEqual({ caseId: 'case-1' });
      expect(again).toEqual(first);
      expect(tickets).toHaveLength(1);
      expect(tickets[0]).toMatchObject({
        kind: 'HELP',
        desk: 'PLATFORM',
        requesterId: 'user-1',
        subjectType: 'WhatsappConversation',
        subjectId: 'conv-1',
        subject: 'WhatsApp: My ticket QR is not loading',
      });
      expect(tickets[0].messages.create).toMatchObject({ side: 'REQUESTER', authorId: 'user-1' });
      expect(tickets[0].messages.create.body).toContain('My ticket QR is not loading\n\n[image]\nhttps://s3/x.jpg');
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ mobileNumber: { in: ['+919876543210', '919876543210'] } });
      expect(conv).toMatchObject({ caseId: 'case-1', userId: 'user-1' });
    });

    it('with no matching account, the admin raises it for the number', async () => {
      const { svc, tickets } = setup(null);
      await svc.convertToCase('conv-1', 'admin-1', ['m1']);
      expect(tickets[0]).toMatchObject({ desk: 'PLATFORM', requesterId: 'admin-1' });
      expect(tickets[0].messages.create).toMatchObject({ side: 'SYSTEM' });
      expect(tickets[0].messages.create.body).toContain('Asha (+919876543210), no Unifesto account matched');
    });

    it('needs at least one message from the conversation', async () => {
      const { svc, prisma, tickets } = setup(null);
      prisma.whatsappMessage.findMany.mockResolvedValueOnce([]);
      await expect(svc.convertToCase('conv-1', 'admin-1', ['other'])).rejects.toThrow('Pick at least one message');
      expect(tickets).toHaveLength(0);
    });
  });

  describe('D27: help desk escalate to organiser', () => {
    function setup({ manager = false, notified = ['vol-1'] } = {}) {
      const query: any = {
        id: 'q1',
        leaderboardId: 'b1',
        topicName: 'Wi-Fi',
        roomName: 'Hall B',
        message: 'Wi-Fi keeps dropping at our table',
        raisedBy: 'member-1',
        notifiedUserIds: notified,
        caseId: null,
        escalatedAt: null,
        entrant: { teamCode: 'T07', name: 'Byte Me' },
      };
      const prisma: any = {
        hackathonHelpQuery: {
          findFirst: jest.fn(async () => ({ ...query })),
          update: jest.fn(async ({ data }) => Object.assign(query, data)),
        },
        userRole: { findFirst: jest.fn(async () => ({ id: 'role' })) },
        event: { findUniqueOrThrow: jest.fn(async () => ({ spaceId: 'space-1' })) },
        user: { findUnique: jest.fn(async () => ({ fullName: 'Ravi', username: null })) },
      };
      const { tickets, events } = caseStore(prisma);
      const leaderboard = { canManage: jest.fn(async () => manager) };
      const teams = { getBoardOrThrow: jest.fn(async () => ({ id: 'b1' })) };
      const svc = new HackathonHelpService(prisma, leaderboard as any, teams as any, events);
      jest.spyOn(svc, 'inbox').mockResolvedValue({ canManage: manager, queries: [] });
      return { svc, tickets, query };
    }

    it('opens one Space-desk case for the event with team and room, and a second click returns it', async () => {
      const { svc, tickets, query } = setup();
      await svc.escalate('vol-1', 'event-1', 'q1');
      await svc.escalate('vol-1', 'event-1', 'q1');

      expect(tickets).toHaveLength(1);
      expect(tickets[0]).toMatchObject({
        kind: 'HELP',
        desk: 'SPACE',
        spaceId: 'space-1',
        eventId: 'event-1',
        requesterId: 'member-1',
        subjectType: 'HackathonHelpQuery',
        subjectId: 'q1',
      });
      expect(tickets[0].messages.create).toMatchObject({ side: 'REQUESTER', authorId: 'member-1' });
      expect(tickets[0].messages.create.body).toContain('Wi-Fi keeps dropping at our table');
      expect(tickets[0].messages.create.body).toContain('Team: Byte Me (T07) · Room: Hall B · Topic: Wi-Fi');
      expect(query).toMatchObject({ caseId: 'case-1', escalatedAt: expect.any(Date) });
    });

    it('only the people it was sent to (or curators) can escalate', async () => {
      const { svc, tickets } = setup({ notified: ['someone-else'] });
      await expect(svc.escalate('vol-1', 'event-1', 'q1')).rejects.toThrow('wasn’t sent to you');
      expect(tickets).toHaveLength(0);

      const cur = setup({ manager: true, notified: [] });
      await cur.svc.escalate('curator-1', 'event-1', 'q1');
      expect(cur.tickets).toHaveLength(1);
    });
  });
});
