import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { vi } from "vitest";

/** A reply with a status other than 200. */
export const status = (code: number, body: unknown = {}) => ({ [STATUS]: code, body });
const STATUS = Symbol("status");

type Reply = object | ((body: unknown) => unknown);
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Stubs the API at the network edge: global fetch, plus an axios adapter for
 * the console's client. Routes are "METHOD /path" (no host, no query string).
 * Anything unrouted answers 404, so background calls fail the way they would
 * against an API that lacks them. Returns every call made, for assertions.
 */
export function mockApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const reply = (method: string, url: string, raw: unknown) => {
    const path = new URL(url, "http://localhost").pathname;
    const body = typeof raw === "string" ? JSON.parse(raw) : (raw ?? null);
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    const out = typeof route === "function" ? route(body) : route;
    if (out === undefined) return { code: 404, data: { message: `No mock for ${method} ${path}` } };
    if (out && typeof out === "object" && STATUS in out) {
      const s = out as { [STATUS]: number; body: unknown };
      return { code: s[STATUS], data: s.body };
    }
    return { code: 200, data: out };
  };

  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const { code, data } = reply((init.method ?? "GET").toUpperCase(), url, init.body);
    return new Response(JSON.stringify(data), { status: code, headers: { "Content-Type": "application/json" } });
  });

  const adapter: AxiosAdapter = async (config) => {
    const url = new URL(config.url ?? "", `${config.baseURL ?? "http://localhost"}/`).href;
    const { code, data } = reply((config.method ?? "get").toUpperCase(), url, config.data);
    const response = { data, status: code, statusText: "", headers: {}, config } as AxiosResponse;
    if (code >= 400) throw new AxiosError(`Request failed with status code ${code}`, "ERR_BAD_RESPONSE", config, {}, response);
    return response;
  };

  return { calls, adapter };
}
