/// <reference types="jest" />
import { findIdentityByEmail, idsByEmail, normalizeEmail, normalizeMobile, sameEmail } from './identifiers';

describe('J17 identifier normalisation', () => {
  it.each([
    ['+919876543210', '+919876543210'], // what mobile 4.0.5 and the web send
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['(+91) 98765 43210', '+919876543210'],
    ['00919876543210', '+919876543210'],
    ['+14155550123', '+14155550123'],
    ['14155550123', '+14155550123'],
    ['+0123456789', null], // the `+0` placeholder form
    ['12345', null],
    ['deleted-ab12', null],
    ['', null],
  ])('normalizeMobile(%j) = %j', (raw, want) => {
    expect(normalizeMobile(raw)).toBe(want);
  });

  it('emails are trimmed and lowercased', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
    expect(sameEmail('A_b@x.com', 'a_B@X.com')).toBe(true);
    expect(sameEmail('a_b@x.com', 'aXb@x.com')).toBe(false);
  });
});

/** ILIKE treats `_`/`%` as wildcards, so DB hits are re-checked exactly. */
describe('J17 email lookups re-check ILIKE hits', () => {
  it('findIdentityByEmail skips a wildcard hit and keeps the exact one', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { userId: 'wrong', email: 'aXb@x.com' },
      { userId: 'right', email: 'A_B@x.com' },
    ]);
    const hit = await findIdentityByEmail({ userIdentity: { findMany } }, ' a_b@X.com ', {
      select: { userId: true },
      orderBy: [{ emailVerified: 'desc' }],
    });
    expect(hit).toEqual({ userId: 'right', email: 'A_B@x.com' });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      select: { userId: true, email: true },
      where: { email: { equals: 'a_b@x.com', mode: 'insensitive' } },
      orderBy: [{ emailVerified: 'desc' }],
    });
  });

  it('findIdentityByEmail returns null when only wildcard hits come back', async () => {
    const findMany = jest.fn().mockResolvedValue([{ userId: 'wrong', email: 'anything@x.com' }]);
    expect(await findIdentityByEmail({ userIdentity: { findMany } }, '%@x.com')).toBeNull();
  });

  it('idsByEmail keeps exact (any-case) matches only, scoped by `where`', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 't1', attendeeEmail: 'A_b@x.com' },
      { id: 't2', attendeeEmail: 'aXb@x.com' },
      { id: 't3', attendeeEmail: 'c@x.com' },
    ]);
    const ids = await idsByEmail({ findMany }, { registrationId: 'r1' }, 'attendeeEmail', ['a_b@x.com', 'C@X.com', null]);
    expect(ids).toEqual(['t1', 't3']);
    expect(findMany.mock.calls[0][0].where.AND[0]).toEqual({ registrationId: 'r1' });
  });

  it('idsByEmail with no emails skips the query', async () => {
    const findMany = jest.fn();
    expect(await idsByEmail({ findMany }, {}, 'attendeeEmail', [undefined, ' '])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
