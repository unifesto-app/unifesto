import { expect, jest, test } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import React from 'react';
import SplashScreen from '../src/screens/SplashScreen';

// The splash must hand over exactly once, and never before its 2.6s hold:
// a missed handover leaves the app sitting on the splash.
test('splash hands over once, after its hold, when auth is ready', async () => {
  jest.useFakeTimers();
  const done = jest.fn();
  const view = await render(<SplashScreen shouldExit={false} onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(2600));
  expect(done).not.toHaveBeenCalled(); // auth still loading

  await view.rerender(<SplashScreen shouldExit onAnimationComplete={done} />);
  expect(done).toHaveBeenCalledTimes(1);

  await view.rerender(<SplashScreen shouldExit onAnimationComplete={done} />);
  expect(done).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test('splash holds 2.6s even when auth is ready at once', async () => {
  jest.useFakeTimers();
  const done = jest.fn();
  await render(<SplashScreen shouldExit onAnimationComplete={done} />);

  await act(() => jest.advanceTimersByTime(2599));
  expect(done).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(done).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
