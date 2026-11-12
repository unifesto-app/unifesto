import { useSyncExternalStore } from 'react';

/**
 * The launch splash's two moments, for the screens it covers.
 * `appMayMount`: the intro has settled and auth has loaded, so Home can mount
 * under the splash; mounting earlier would cost the letters frames.
 * `done`: the splash has gone, so sheets (legal, What's new) may open.
 * Both only ever turn on, and stay on for the life of the process, so a
 * remount (the crash screen's retry, Fast Refresh) never replays the splash.
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
