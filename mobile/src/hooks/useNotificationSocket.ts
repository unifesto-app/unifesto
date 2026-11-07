import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../lib/constants';
import { getToken } from '../lib/api/helpers';

/** A notification as the server sends it when its in-app copy is written. */
export interface LiveNotification {
  type: string;
  eventId: string | null;
  title: string;
  body: string;
  deepLink: string | null;
  data: Record<string, unknown> | null;
}

// The same notification can also land as a foreground push a moment later.
const SEEN_MS = 2 * 60_000;
const seen = new Map<string, number>();
const keyOf = (n: { title?: string | null; body?: string | null }) => `${(n.title ?? '').slice(0, 200)}\n${n.body ?? ''}`;

/** True when the live socket already delivered this one (so a foreground push is a repeat). */
export function seenLive(n: { title?: string | null; body?: string | null }): boolean {
  const at = seen.get(keyOf(n));
  return !!at && Date.now() - at < SEEN_MS;
}

function remember(n: LiveNotification) {
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > SEEN_MS) seen.delete(k);
  seen.set(keyOf(n), now);
}

/**
 * C13: the signed-in user's notifications, live while the app is open,
 * whether or not push is allowed. The server sends each one as its in-app copy
 * is written, before the push goes out. Closed in the background (iOS suspends
 * it anyway) and reopened with a fresh token on return.
 */
export function useNotificationSocket(onNotification: (n: LiveNotification) => void): void {
  const { isAuthenticated } = useAuth();
  const cb = useRef(onNotification);
  cb.current = onNotification;

  useEffect(() => {
    if (!isAuthenticated) return;
    // Websocket only: the API runs several replicas behind a round-robin
    // proxy, and long-polling would need sticky sessions. auth as a callback:
    // every (re)connect sends the current token.
    const socket = io(`${API_URL}/notifications`, {
      transports: ['websocket'],
      auth: (send) => void getToken().then((token) => send({ token })),
      reconnectionDelayMax: 30_000,
    });
    socket.on('notification:new', (n: LiveNotification) => {
      remember(n);
      cb.current(n);
    });
    // The server drops the socket when the token expires; socket.io won't
    // retry a server-side disconnect (or a refused token) on its own.
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' && AppState.currentState === 'active') socket.connect();
    });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') socket.connect();
      else if (s === 'background') socket.disconnect();
    });
    return () => {
      appState.remove();
      socket.disconnect();
    };
  }, [isAuthenticated]);
}
