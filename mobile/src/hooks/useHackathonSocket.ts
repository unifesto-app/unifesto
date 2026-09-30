import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../lib/constants';
import { getToken } from '../lib/api/helpers';
import { onNotificationArrived } from '../lib/notificationBus';

const POLL_MS = 10_000;
const DEBOUNCE_MS = 400;

/**
 * Keep a hackathon screen live: calls `onChange` whenever the server says the
 * queue moved for this user (curator, judge or team; the server decides which
 * rooms they join), when a hackathon push arrives, and when the app comes back
 * to the foreground. While the socket is down it polls every 10 seconds instead.
 *
 * The socket carries no data, only "refetch": what each person may see is
 * still decided by the HTTP endpoints.
 */
export default function useHackathonSocket(eventId: string | undefined, onChange: () => void, enabled = true): { live: boolean } {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!eventId || !enabled) return;
    let socket: Socket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), DEBOUNCE_MS);
    };

    void getToken().then((token) => {
      if (cancelled || !token) return;
      // Websocket only: the API runs several replicas behind a round-robin
      // proxy, and long-polling would need sticky sessions.
      socket = io(`${API_URL}/leaderboard`, { transports: ['websocket'], auth: { token }, reconnectionDelayMax: 10_000 });
      socket.on('connect', () => {
        socket?.emit('hackathon:subscribe', { eventId }, (res: { ok?: boolean } | undefined) => {
          setLive(!!res?.ok);
        });
        fire(); // catch up on anything missed while disconnected
      });
      socket.on('disconnect', () => setLive(false));
      socket.on('connect_error', () => setLive(false));
      socket.on('hackathon:changed', (p: { eventId?: string }) => {
        if (!p?.eventId || p.eventId === eventId) fire();
      });
    });

    const offPush = onNotificationArrived((n) => {
      if (n.type === 'hackathon' && (!n.eventId || n.eventId === eventId)) fire();
    });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') fire();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      offPush();
      appState.remove();
      socket?.emit('hackathon:unsubscribe');
      socket?.disconnect();
      setLive(false);
    };
  }, [eventId, enabled]);

  // Fallback: poll while the socket isn't delivering.
  useEffect(() => {
    if (!eventId || !enabled || live) return;
    const t = setInterval(() => cb.current(), POLL_MS);
    return () => clearInterval(t);
  }, [eventId, enabled, live]);

  return { live };
}

/** The current time, updated every second while mounted (for slot timers). */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
