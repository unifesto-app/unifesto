import { FreeAttendeeAddService } from './free-attendee-add.service';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';

/** D5: a request opens its Assist case, and the review lands on it as a SYSTEM line. */
describe('free-add request ↔ Assist case (D5)', () => {
  it('opens a Platform REQUEST case on create and resolves it on review', async () => {
    const tx: any = {
      freeAttendeeAddRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
      event: { update: jest.fn() },
    };
    const prisma: any = {
      event: { findUnique: jest.fn(async () => ({ id: 'ev', spaceId: 'sp', title: 'Hack Day' })) },
      eventTicketType: { findFirst: jest.fn() },
      space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) },
      freeAttendeeAddRequest: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'r1' })),
        findUnique: jest.fn(async () => ({ id: 'r1', eventId: 'ev', status: 'PENDING', requestedSeats: 5 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'r1' })),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const events: any = { emit: jest.fn() };
    const svc = new FreeAttendeeAddService(prisma, events);

    await svc.createRequest('u1', { eventId: 'ev', reason: 'Volunteers', seats: 5 } as any);
    expect(events.emit).toHaveBeenCalledWith(
      SUBJECT_CASE_OPEN,
      expect.objectContaining({
        subjectType: 'FreeAttendeeAddRequest',
        subjectId: 'r1',
        requesterId: 'u1',
        kind: 'REQUEST',
        desk: 'PLATFORM',
        eventId: 'ev',
        message: 'Volunteers',
      }),
    );

    await svc.reviewRequest('r1', 'admin', { status: 'REJECTED', reviewNote: 'Paid event' } as any);
    expect(events.emit).toHaveBeenLastCalledWith(
      SUBJECT_CASE_UPDATE,
      expect.objectContaining({
        subjectId: 'r1',
        actorId: 'admin',
        text: 'Unifesto declined the free seats. Note: Paid event',
        status: 'RESOLVED',
      }),
    );
  });
});
