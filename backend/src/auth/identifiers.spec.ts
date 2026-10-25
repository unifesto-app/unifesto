/// <reference types="jest" />
import { normalizeEmail, normalizeMobile, sameEmail } from './identifiers';

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
