/**
 * Result-style fetch, same contract as mobile's `call` (mobile/src/lib/api/manageEvent.ts),
 * so the tracking and hackathon clients are shared near-verbatim with mobile.
 * The backend answers a missing permission with 400 "Unauthorized" or 403,
 * so both count as `denied`.
 */
import { currentToken, renewToken } from "@/console/lib/utils/auth";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type Result<T> = { ok: true; data: T } | { ok: false; denied: boolean; message: string };

/** fetch against the backend with the session token (JSON content type unless FormData). On a 401 it renews the token once and retries (V8). */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  };
  const res = await send(await currentToken());
  if (res.status !== 401) return res;
  const fresh = await renewToken();
  return fresh ? send(fresh) : res;
}

export async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await authedFetch(path, init);
    const body = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: body as T };
    const message: string =
      (Array.isArray(body?.message) ? body.message[0] : body?.message) || "Something went wrong";
    const denied = response.status === 403 || (response.status === 400 && /unauthori[sz]ed/i.test(message));
    return { ok: false, denied, message };
  } catch {
    return { ok: false, denied: false, message: "No connection" };
  }
}
