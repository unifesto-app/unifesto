import { jest } from '@jest/globals';

/** A reply with a status other than 200. */
export const status = (code: number, body: unknown = {}) => ({ [STATUS]: code, body });
const STATUS = Symbol('status');

type Reply = object | ((body: unknown) => unknown);
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Stubs the API at fetch. Routes are "METHOD /path" (no host, no query string).
 * Anything unrouted answers 404, the way an API that lacks it would. Returns
 * every call made, for assertions.
 */
export function mockApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const path = new URL(String(input instanceof Request ? input.url : input), 'http://localhost').pathname;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    let out = typeof route === 'function' ? route(body) : route;
    let code = 200;
    if (out === undefined) [code, out] = [404, { message: `No mock for ${method} ${path}` }];
    else if (out && typeof out === 'object' && STATUS in out) {
      const s = out as { [STATUS]: number; body: unknown };
      [code, out] = [s[STATUS], s.body];
    }
    return new Response(JSON.stringify(out), { status: code, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls };
}
