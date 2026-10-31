import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyService, nextDueDate } from './company.service';
import { Action } from '../auth/authorization';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date | null) => x?.toISOString().slice(0, 10);

describe('nextDueDate', () => {
  it('moves by the recurrence and clamps to the month end', () => {
    expect(iso(nextDueDate(d('2027-01-31'), 'MONTHLY'))).toBe('2027-02-28');
    expect(iso(nextDueDate(d('2026-11-15'), 'QUARTERLY'))).toBe('2027-02-15');
    expect(iso(nextDueDate(d('2028-02-29'), 'ANNUAL'))).toBe('2029-02-28');
    expect(nextDueDate(d('2026-11-15'), 'NONE')).toBeNull();
  });
});

/** Permission and recurrence rules, with the DB and the capability lookup faked. */
describe('CompanyService', () => {
  const OWNER = 'u-owner';
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'i1',
    number: 7,
    title: 'GST return',
    category: 'GST',
    status: 'TODO',
    dueDate: d('2026-11-20'),
    ownerId: OWNER,
    restricted: false,
    filedOn: null,
    reference: null,
    notes: null,
    recurrence: 'MONTHLY',
    ...over,
  });

  const build = (caps: string[], existing = item()) => {
    const prisma = {
      companyItem: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          where.number === undefined
            ? null // spawnNext's duplicate check: nothing yet
            : where.restricted === false && existing.restricted
              ? null
              : existing,
        ),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...existing,
          ...Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          ),
        })),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'i2', number: 8, ...data })),
      },
      companyActivity: { create: jest.fn().mockResolvedValue({}) },
    };
    const authz = { platformActions: jest.fn().mockResolvedValue(caps) };
    return { svc: new CompanyService(prisma as any, authz as any), prisma };
  };
  const user = (id: string) => ({ id, fullName: 'Test' }) as any;
  const EMPLOYEE = [Action.COMPANY_VIEW, Action.COMPANY_EDIT];
  const ADMIN = [
    ...EMPLOYEE,
    Action.COMPANY_MANAGE,
    Action.COMPANY_VIEW_RESTRICTED,
  ];

  it('lets an owner change status but not the due date', async () => {
    const { svc } = build(EMPLOYEE);
    await expect(
      svc.upsert(user(OWNER), { number: 7, status: 'IN_PROGRESS' }),
    ).resolves.toBeTruthy();
    await expect(
      svc.upsert(user(OWNER), { number: 7, dueDate: '2026-12-01' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("stops an employee editing someone else's item or creating one", async () => {
    const { svc } = build(EMPLOYEE);
    await expect(
      svc.upsert(user('u-other'), { number: 7, status: 'DONE' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.upsert(user(OWNER), { title: 'New', category: 'TAX' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides restricted items without company:view-restricted', async () => {
    const { svc } = build(EMPLOYEE, item({ restricted: true }));
    await expect(svc.get(user(OWNER), 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates the next copy when a recurring item is marked DONE', async () => {
    const { svc, prisma } = build(ADMIN);
    await svc.upsert(user('u-admin'), { number: 7, status: 'DONE' });
    expect(prisma.companyItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'GST return',
        dueDate: d('2026-12-20'),
        ownerId: OWNER,
      }),
    });
  });
});
