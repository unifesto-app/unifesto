import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import React from 'react';
import SplashScreen from '../src/screens/SplashScreen';
import { launchGate } from '../src/lib/launchGate';

// The splash must hand over exactly once, never before its 2.6s hold, and
// never get stuck: a missed handover leaves the app sitting on the splash.
// The hold counts from mount.

beforeEach(() => {
  jest.useFakeTimers();
  launchGate.set({ appMayMount: false, done: false });
});
afterEach(() => {
  jest.useRealTimers();
});

test('hands over once, after its hold, when auth loads late', async () => {
  const done = jest.fn();
  const view = await render(<SplashScreen shouldExit={false} onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(4000));
  expect(done).not.toHaveBeenCalled(); // auth still loading
  expect(launchGate.get().appMayMount).toBe(false); // Home waits for auth

  await view.rerender(<SplashScreen shouldExit onAnimationComplete={done} />);
  expect(launchGate.get().appMayMount).toBe(true); // Home mounts first...
  expect(done).not.toHaveBeenCalled(); // ...and the exit waits for it to settle
  await act(() => jest.advanceTimersByTime(400));
  expect(done).toHaveBeenCalledTimes(1);
  expect(launchGate.get().done).toBe(true);

  await act(() => jest.advanceTimersByTime(5000)); // the fallback timer must not hand over twice
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

test('never stuck: leaves by 12s even if auth never loads', async () => {
  const done = jest.fn();
  await render(<SplashScreen shouldExit={false} onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(11900));
  expect(done).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(200));
  expect(done).toHaveBeenCalledTimes(1);
  expect(launchGate.get()).toEqual({ appMayMount: true, done: true });
});
