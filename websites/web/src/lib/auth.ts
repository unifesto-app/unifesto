"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Web sign-in session (K10, K18). The refresh token sits in our own server's
 * httpOnly, host-only cookie (src/app/auth/*); this module holds only the
 * access token, in memory. Each page load asks /auth/session for a fresh one,
 * so a session lasts as long as the backend's refresh window instead of the
 * old 24-hour localStorage token. No shared `.unifesto.app` cookie: that one
 * belongs to the operator apps and has caused cross-app login loops.
 */

export interface WebSession {
  token: string;
  email: string;
  fullName: string | null;
}

/** A Google account new to Unifesto: it needs a mobile number before it can sign in. */
export interface PendingSignIn {
  tempToken: string;
  email: string;
}

interface State {
  session: WebSession | null;
  /** False until this page has asked the server whether it's signed in. */
  ready: boolean;
  pending: PendingSignIn | null;
}

let state: State = { session: null, ready: false, pending: null };
const SERVER_STATE: State = { session: null, ready: false, pending: null };
const listeners = new Set<() => void>();
const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const post = (path: string, body?: unknown, token?: string) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });

let restoring: Promise<void> | null = null;

/** Once per page: trade the refresh cookie for an access token. */
function restore(): Promise<void> {
  restoring ??= (async () => {
    // K18 replaces the 24h localStorage token; drop any left behind.
    try {
      localStorage.removeItem("unifesto_web_session");
    } catch {
      /* storage blocked */
    }
    try {
      const res = await post("/auth/session");
      const data = res.ok ? await res.json() : null;
      if (data?.accessToken) update({ session: { token: data.accessToken, email: data.email, fullName: data.fullName } });
      else if (data?.pending) update({ pending: data.pending });
    } catch {
      /* offline: signed out for this page */
    }
    update({ ready: true });
  })();
  return restoring;
}

/** The current session, once the page has checked. Kicks off that check. */
export function useWebSession(): State {
  useEffect(() => {
    void restore();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export const getSession = () => state.session;

/** Keep page-side changes (a name just saved) in the session. */
export const setSession = (session: WebSession) => update({ session });

/**
 * After an email or phone code: hand the refresh token to our server (which
 * rotates it into the cookie) and keep only the access token here. Falls back
 * to the code's own access token, for this page only, if that fails.
 */
export async function startSession(
  auth: { accessToken: string; refreshToken?: string },
  who: { email: string; fullName: string | null },
): Promise<WebSession> {
  let session: WebSession = { token: auth.accessToken, ...who };
  if (auth.refreshToken) {
    try {
      const res = await post("/auth/session", { refreshToken: auth.refreshToken });
      const data = res.ok ? await res.json() : null;
      if (data?.accessToken) session = { token: data.accessToken, email: data.email || who.email, fullName: data.fullName ?? who.fullName };
    } catch {
      /* keep the code's token */
    }
  }
  update({ session, pending: null, ready: true });
  return session;
}

/** Sign out here and on the backend. */
export function clearSession(): void {
  const token = state.session?.token;
  update({ session: null, pending: null });
  void post("/auth/logout", undefined, token).catch(() => undefined);
}

/** Where "Continue with Google" goes: back to `next` signed in. */
export const googleSignInHref = (next: string) => `/auth/google?next=${encodeURIComponent(next)}`;
