import { hmacSecret } from './secrets';

// S31: no hardcoded fallback; never the raw JWT secret.
describe('hmacSecret', () => {
  const env = (o: Record<string, string>) => (k: string) => o[k];

  it('prefers the dedicated secret', () => {
    expect(hmacSecret('X_SECRET', 'x', env({ X_SECRET: 'own', JWT_SECRET: 'j' }))).toBe('own');
  });
  it('derives a per-purpose key from JWT_SECRET otherwise', () => {
    const a = hmacSecret('A', 'a', env({ JWT_SECRET: 'j' }));
    const b = hmacSecret('B', 'b', env({ JWT_SECRET: 'j' }));
    expect(a).not.toBe('j');
    expect(a).not.toBe(b);
  });
  it('throws instead of falling back to a constant', () => {
    expect(() => hmacSecret('A', 'a', env({}))).toThrow();
  });
});
