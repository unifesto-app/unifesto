import type { NextRequest, NextResponse } from "next/server";
import { apiBase, withInternal } from "@/lib/api/internal";

/*
 * K18: web sessions, server half. The refresh token lives only in a host-only
 * (no Domain), httpOnly, Secure, SameSite=Lax cookie scoped to /auth, so it
 * never reaches page scripts and never the shared .unifesto.app cookie the
 * operator apps use. Pages get a short-lived access token from /auth/session.
 */

const API = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

export const REFRESH_COOKIE = "uf_rt";
/** PKCE verifier, state and return path while Google sign-in is in flight. */
export const OAUTH_COOKIE = "uf_oauth";
/** A Google account that still needs a mobile number: its temp token and email. */
export const PENDING_COOKIE = "uf_pending";

const secure = process.env.NODE_ENV === "production";
const cookie = (maxAge: number) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/auth", maxAge });
/** Matches the backend's REFRESH_EXPIRES_IN (180d); the backend still enforces its own cap. */
const refreshCookie = cookie(180 * 24 * 60 * 60);
export const shortCookie = cookie(15 * 60);

export const clearCookie = (res: NextResponse, name: string) => res.cookies.set(name, "", { ...cookie(0), maxAge: 0 });

/** Readable by pages, holds no secret: lets the navbar say "My account" without asking the server. */
const HINT_COOKIE = "uf_in";
const hintCookie = { secure, sameSite: "lax" as const, path: "/" };

/** The refresh cookie and its signed-in hint always move together. */
export function setRefresh(res: NextResponse, refreshToken: string) {
  res.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookie);
  res.cookies.set(HINT_COOKIE, "1", { ...hintCookie, maxAge: refreshCookie.maxAge });
}
export function clearRefresh(res: NextResponse) {
  clearCookie(res, REFRESH_COOKIE);
  res.cookies.set(HINT_COOKIE, "", { ...hintCookie, maxAge: 0 });
}

/** Only same-site paths: never an open redirect. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/console";
}

/** Requests that change auth state must come from our own pages. */
export function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}

/** `userAgent`: the browser's, on calls that sign in, so my linked devices say "Chrome on macOS" and not Node. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string; userAgent?: string | null } = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(
    `${API}${path}`,
    withInternal({
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.userAgent ? { "User-Agent": init.userAgent } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    }),
  );
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Rotate a refresh token. null when the backend refuses it (expired, revoked, reused). */
export async function rotate(refreshToken: string, userAgent?: string | null): Promise<Tokens | null> {
  const { status, data } = await api<Tokens>("/auth/refresh", { method: "POST", body: { refreshToken }, userAgent });
  return status === 200 && data.accessToken && data.refreshToken ? data : null;
}

/** What pages show: the account's name and its primary (else first) email. */
export async function profile(accessToken: string): Promise<{ email: string; fullName: string | null }> {
  const [me, ids] = await Promise.all([
    api<{ fullName?: string | null }>("/users/me", { token: accessToken }),
    api<{ email: string | null; isPrimary: boolean }[]>("/users/me/identities", { token: accessToken }),
  ]);
  const list = Array.isArray(ids.data) ? ids.data.filter((i) => i.email) : [];
  return { email: (list.find((i) => i.isPrimary) ?? list[0])?.email ?? "", fullName: me.data.fullName ?? null };
}
