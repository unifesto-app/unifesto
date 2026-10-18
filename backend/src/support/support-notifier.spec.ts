import { SupportTicketStatus } from '@prisma/client';
import { deskHeadline, requesterHeadline } from './support-notifier';

const e = (kind: any) => ({ ticketId: 't', kind, to: 'REQUESTER' as const, actorId: 'a' });

describe('Assist notification copy (D3)', () => {
  it('tells the requester about replies, resolve/close and escalation, never their own new case', () => {
    expect(requesterHeadline(e('REPLIED'), SupportTicketStatus.PENDING)).toBe('New reply to your request');
    expect(requesterHeadline(e('STATUS'), SupportTicketStatus.RESOLVED)).toBe('Your request was resolved');
    expect(requesterHeadline(e('STATUS'), SupportTicketStatus.CLOSED)).toBe('Your request was closed');
    expect(requesterHeadline(e('STATUS'), SupportTicketStatus.OPEN)).toBeNull();
    expect(requesterHeadline(e('CREATED'), SupportTicketStatus.OPEN)).toBeNull();
  });

  it('names the case number for the desk', () => {
    expect(deskHeadline(e('CREATED'), 1042)).toBe('New request #1042');
    expect(deskHeadline(e('ESCALATED'), 7)).toBe('#7 was escalated to Unifesto');
  });
});
