import { BadRequestException } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';

// D7: host one event without a space: a personal space + draft event, at once since Q29.
describe('SpacesService event requests', () => {
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const dto = { title: 'Robotics night', startDateTime: future(10), endDateTime: future(10.1), city: 'Hyderabad' };

  function build(opts: { runsSpace?: boolean; pending?: boolean; claimed?: number } = {}) {
    const req = {
      id: 'r1',
      userId: 'u1',
      title: 'Robotics night',
      description: null,
      type: 'IN_PERSON',
      startDateTime: new Date(dto.startDateTime),
      endDateTime: new Date(dto.endDateTime),
      city: 'Hyderabad',
      createdAt: new Date(),
      user: { fullName: 'Asha Rao', username: 'asha' },
    };
    const tx = {
      eventRequest: {
        create: jest.fn((a) => ({ ...req, ...a.data })),
        updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
        update: jest.fn((a) => ({ ...req, ...a.data })),
      },
      space: { create: jest.fn((a) => ({ id: 's1', ...a.data })) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-sa' }) },
      userRole: { create: jest.fn() },
      orgSubscription: { create: jest.fn() },
      event: { create: jest.fn((a) => ({ id: 'e1', ...a.data })) },
    };
    const prisma = {
      userRole: { findFirst: jest.fn().mockResolvedValue(opts.runsSpace ? { id: 'ur' } : null) },
      eventRequest: {
        findFirst: jest.fn().mockResolvedValue(opts.pending ? { id: 'old' } : null),
        create: jest.fn((a) => ({ id: 'r1', ...a.data })),
        findUnique: jest.fn().mockResolvedValue(req),
        updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(req.user) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const events = { emit: jest.fn() };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never, events as never);
    return { svc, prisma, tx, events };
  }

  it('makes the personal space (live, Unverified) and the draft event at once, with nothing to review', async () => {
    const { svc, tx, events } = build();
    const out = await svc.createEventRequest('u1', dto);
    expect(tx.eventRequest.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', status: 'APPROVED' });
    const space = tx.space.create.mock.calls[0][0].data;
    expect(space).toMatchObject({ name: 'Asha Rao', createdBy: 'u1', status: 'ACTIVE', approvedBy: null });
    expect(space.verifiedAt).toBeUndefined();
    expect(tx.userRole.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', spaceId: 's1', assignedBy: null });
    expect(tx.event.create.mock.calls[0][0].data).toMatchObject({ title: 'Robotics night', spaceId: 's1' });
    expect(out).toMatchObject({ spaceId: 's1', eventId: 'e1' });
    expect(events.emit.mock.calls.map(([name]) => name)).not.toContain(SUBJECT_CASE_OPEN);
  });

  it('sends people who already run a space to it, and allows one pending request', async () => {
    await expect(build({ runsSpace: true }).svc.createEventRequest('u1', dto)).rejects.toThrow(BadRequestException);
    await expect(build({ pending: true }).svc.createEventRequest('u1', dto)).rejects.toThrow(/under review/);
    await expect(
      build().svc.createEventRequest('u1', { ...dto, startDateTime: future(-2), endDateTime: future(-1) }),
    ).rejects.toThrow(/future/);
  });

  it('approves into a personal space they run and a draft event', async () => {
    const { svc, tx, events } = build();
    const out = await svc.approveEventRequest('r1', 'admin');
    expect(tx.space.create.mock.calls[0][0].data).toMatchObject({ name: 'Asha Rao', createdBy: 'u1', status: 'ACTIVE' });
    expect(tx.userRole.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', roleId: 'role-sa', spaceId: 's1' });
    expect(tx.orgSubscription.create).toHaveBeenCalled();
    const ev = tx.event.create.mock.calls[0][0].data;
    expect(ev).toMatchObject({ title: 'Robotics night', spaceId: 's1', createdBy: 'u1' });
    expect(ev.status).toBeUndefined(); // the schema default, DRAFT
    expect(out).toMatchObject({ spaceId: 's1', eventId: 'e1' });
    expect(events.emit).toHaveBeenCalledWith(
      SUBJECT_CASE_UPDATE,
      expect.objectContaining({ subjectId: 'r1', status: 'RESOLVED', notify: true }),
    );
  });

  it('never approves twice', async () => {
    const { svc, tx } = build({ claimed: 0 });
    await expect(svc.approveEventRequest('r1', 'admin')).rejects.toThrow(/already been reviewed/);
    expect(tx.space.create).not.toHaveBeenCalled();
  });

  it('rejects with the reason on the case', async () => {
    const { svc, events } = build();
    await svc.rejectEventRequest('r1', 'admin', 'Too soon');
    expect(events.emit).toHaveBeenCalledWith(
      SUBJECT_CASE_UPDATE,
      expect.objectContaining({ status: 'RESOLVED', notify: true, text: 'Unifesto declined the event request. Note: Too soon' }),
    );
  });
});
