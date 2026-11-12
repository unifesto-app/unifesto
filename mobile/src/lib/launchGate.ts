import { useSyncExternalStore } from 'react';

/**
 * The launch splash's two moments, for the screens it covers.
 * `appMayMount`: the intro has settled, auth has loaded and the last letter
 * swap has landed, so Home (and a held cold-start link) can mount under the
 * splash while nothing moves.
 * `done`: the splash has gone, so things that draw over it may show: the
 * legal and What's new sheets, alerts, in-app notices.
 * Both only ever turn on, and stay on for the life of the process, so once
 * the splash has played a remount never replays it.
 */
type LaunchState = { appMayMount: boolean; done: boolean };

let state: LaunchState = { appMayMount: false, done: false };
const listeners = new Set<() => void>();

export const launchGate = {
  get: (): LaunchState => state,
  set(patch: Partial<LaunchState>) {
    const next = { ...state, ...patch };
    if (next.appMayMount === state.appMayMount && next.done === state.done) return;
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useLaunchGate(): LaunchState {
  return useSyncExternalStore(launchGate.subscribe, launchGate.get);
}
