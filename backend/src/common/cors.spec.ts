import { isAllowedOrigin } from './cors';

// S26: anchored origin allowlist.
describe('isAllowedOrigin', () => {
  it.each([
    'https://unifesto.app',
    'https://apex.unifesto.app',
    'https://a.b.unifesto.app',
    'https://wegobeyond.in',
    'https://www.wegobeyond.in',
    'http://localhost',
    'http://localhost:3001',
    'http://127.0.0.1:8080',
  ])('allows %s', (o) => expect(isAllowedOrigin(o)).toBe(true));

  it.each([
    'http://apex.unifesto.app',
    'http://unifesto.app',
    'http://localhost.evil.com',
    'http://localhost:3000.evil.com',
    'https://evilunifesto.app',
    'https://unifesto.app.evil.com',
    'https://evil.com/.unifesto.app',
    'http://wegobeyond.in',
    'https://evilwegobeyond.in',
    'https://wegobeyond.in.evil.com',
    'null',
  ])('refuses %s', (o) => expect(isAllowedOrigin(o)).toBe(false));
});
