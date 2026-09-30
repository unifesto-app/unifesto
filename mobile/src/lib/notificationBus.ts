/**
 * "A notification just arrived" — fired by the foreground push listener so the
 * screen on display can refetch (the hub's room, the updates feed, the unread
 * badge) without the user pulling to refresh.
 */

export interface ArrivedNotification {
  /** `data.type` on the push, e.g. "hackathon" or "competition". */
  type: string;
  eventId?: string;
}

type Listener = (n: ArrivedNotification) => void;

const listeners = new Set<Listener>();

export function onNotificationArrived(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notificationArrived(n: ArrivedNotification): void {
  for (const l of listeners) {
    try {
      l(n);
    } catch {
      // One screen's refresh must never stop another's.
    }
  }
}
