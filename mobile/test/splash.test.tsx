import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import SplashScreen from '../src/screens/SplashScreen';
import { launchGate } from '../src/lib/launchGate';

// The splash must hand over exactly once, never before its 2.6s hold, and
// never get stuck: a missed handover leaves the app sitting on the splash.
// The hold counts from mount. Under jest, Reanimated's animations end at once.

beforeEach(() => {
  jest.useFakeTimers();
  launchGate.set({ appMayMount: false, done: false });
});
afterEach(() => {
  jest.useRealTimers();
});

test('auth late: the loader winds down, Home mounts while still, then it hands over once', async () => {
  const done = jest.fn();
  const view = await render(<SplashScreen shouldExit={false} onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(4000));
  expect(done).not.toHaveBeenCalled(); // auth still loading: the loader runs
  expect(launchGate.get().appMayMount).toBe(false);

  await view.rerender(<SplashScreen shouldExit onAnimationComplete={done} />);
  await act(() => jest.advanceTimersByTime(600));
  expect(launchGate.get().appMayMount).toBe(false); // the last swap is still landing

  await act(() => jest.advanceTimersByTime(1000));
  expect(launchGate.get().appMayMount).toBe(true);
  expect(done).toHaveBeenCalledTimes(1);
  expect(launchGate.get().done).toBe(true);

  await act(() => jest.advanceTimersByTime(5000)); // the fallback must not hand over twice
  expect(done).toHaveBeenCalledTimes(1);
});

test('holds 2.6s even when auth is ready at once', async () => {
  const done = jest.fn();
  await render(<SplashScreen shouldExit onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(2599));
  expect(done).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(600));
  expect(done).toHaveBeenCalledTimes(1);
});

test('never stuck: leaves by the cap even if auth never loads', async () => {
  const done = jest.fn();
  await render(<SplashScreen shouldExit={false} onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(29900));
  expect(done).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1700));
  expect(done).toHaveBeenCalledTimes(1);
  expect(launchGate.get()).toEqual({ appMayMount: true, done: true });
});

test('never stuck: hands over even if the UI thread never reports back', async () => {
  const mock = Reanimated as unknown as { withTiming: (v: number) => number };
  const withTiming = mock.withTiming;
  mock.withTiming = (v: number) => v; // the animations' end callbacks never come
  try {
    const done = jest.fn();
    await render(<SplashScreen shouldExit onAnimationComplete={done} />);
    await act(() => jest.advanceTimersByTime(6000));
    expect(done).not.toHaveBeenCalled(); // exit running, its callback lost
    await act(() => jest.advanceTimersByTime(1500));
    expect(done).toHaveBeenCalledTimes(1);
  } finally {
    mock.withTiming = withTiming;
  }
});
