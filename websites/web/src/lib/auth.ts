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

/** Resolves once this page has asked /auth/session. The console waits on it before its first API call. */
export const sessionReady = (): Promise<void> => restore();

let renewing: Promise<WebSession | null> | null = null;

/**
 * After a 401 (an access token outlived by a long-open tab): ask /auth/session
 * again. Calls made while one is in flight share it, so a burst of 401s
 * rotates the refresh cookie once. null when there is no session to renew.
 */
export function refreshSession(): Promise<WebSession | null> {
  renewing ??= (async () => {
    try {
      const res = await post("/auth/session");
      const data = res.ok ? await res.json() : null;
      const session: WebSession | null = data?.accessToken
        ? { token: data.accessToken, email: data.email, fullName: data.fullName }
        : null;
      update({ session });
      return session;
    } catch {
      return null;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

/** The current session, once the page has checked. Kicks off that check. */
export function useWebSession(): State {
  useEffect(() => {
    void restore();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

const noop = () => () => {};

/**
 * Signed in, without asking the server: the session once this page has
 * checked, else the `uf_in` hint cookie the auth routes keep beside the
 * refresh cookie. For chrome on every page (the navbar), so a visitor who
 * never signed in makes no /auth/session call.
 */
export function useSignedIn(): boolean {
  const { session, ready } = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  const hint = useSyncExternalStore(noop, () => /(?:^|; )uf_in=1/.test(document.cookie), () => false);
  return ready ? Boolean(session) : hint;
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

/** Sign out here and on the backend. Await it before navigating away, or the request can be cut off. */
export function clearSession(): Promise<void> {
  const token = state.session?.token;
  update({ session: null, pending: null });
  return post("/auth/logout", undefined, token).then(
    () => undefined,
    () => undefined,
  );
}

/** Where "Continue with Google/Apple" goes: back to `next` signed in. */
export const signInHref = (provider: "google" | "apple", next: string) => `/auth/${provider}?next=${encodeURIComponent(next)}`;
