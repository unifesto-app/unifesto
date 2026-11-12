import { describe, expect, test } from '@jest/globals';
import {
  EXIT_END,
  INTRO_END,
  INTRO_PROPS,
  LETTERS,
  SWAP_LEN,
  footerOpacity,
  glassFrame,
  groundOpacity,
  introPropFrame,
  letterFrame,
  nextSwap,
  swapPropFrame,
} from './splashMotion';

// The motion was checked frame by frame against the approved GSAP prototype
// (28k values across the intro and exit, and every 4ms of a swap). These keep
// the parts that matter from drifting: rest states, the loader's rules, and a
// few GSAP values.

const REST = [0, 0, 1, 1, 0, 1];
const IDLE = -1;
const close = (a: number[], b: number[], d = 2) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], d));
const I = 2; // the i

describe('intro', () => {
  test('frame one is the bare ground: no letter, prop or footer shows', () => {
    LETTERS.forEach((_, i) => expect(letterFrame(i, 0, IDLE, 0)[5]).toBe(0));
    INTRO_PROPS.forEach((_, k) => {
      const v = introPropFrame(k, 0);
      expect(v[2] * v[5]).toBe(0); // scale 0 or opacity 0
    });
    expect(footerOpacity(0, 0)).toBe(0);
    expect(glassFrame(0, 0)[0]).toBe(0);
  });

  test('every letter is at rest and every prop gone when the intro ends', () => {
    LETTERS.forEach((_, i) => close(letterFrame(i, INTRO_END, IDLE, 0), REST));
    INTRO_PROPS.forEach((_, k) => {
      const v = introPropFrame(k, INTRO_END);
      expect(v[2] * v[5]).toBeCloseTo(0, 3);
    });
  });

  test('matches GSAP at sampled moments', () => {
    expect(letterFrame(0, 0.95, IDLE, 0)[1]).toBeCloseTo(1.968, 2); // u, power3.out
    expect(letterFrame(7, 1.25, IDLE, 0)[4]).toBeCloseTo(17.804, 2); // o, elastic.out(1, 0.45)
    expect(letterFrame(1, 0.95, IDLE, 0)[3]).toBeCloseTo(1.138, 2); // n, back.out(2.2)
    expect(introPropFrame(6, 0.6)[0]).toBeCloseTo(28.672, 2); // ring rolling in
    expect(footerOpacity(1.7, 0)).toBeCloseTo(0.609, 2);
  });
});

describe('loader', () => {
  test('a random letter each time: never the i, never the one that just went', () => {
    let last = -1;
    for (let n = 0; n < 500; n++) {
      const next = nextSwap(last);
      expect(next).not.toBe(I);
      expect(next).not.toBe(last);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(LETTERS.length);
      last = next;
    }
  });

  test('a letter moves only during its own swap', () => {
    expect(letterFrame(3, INTRO_END, 0.1, 0)[5]).toBeLessThan(1); // lifting out
    expect(letterFrame(3, INTRO_END, 0.4, 0)[5]).toBe(0); // out, its prop in its place
    close(letterFrame(3, INTRO_END, IDLE, 0), REST);
    close(letterFrame(3, INTRO_END, SWAP_LEN, 0), REST); // a finished clock is idle
  });

  test('the prop shows only while its letter is out', () => {
    expect(swapPropFrame(0.1)[0]).toBe(0);
    expect(swapPropFrame(0.5)[0]).toBeCloseTo(1, 2);
    expect(swapPropFrame(0.8)[0]).toBeCloseTo(0, 3);
    expect(swapPropFrame(IDLE)[0]).toBe(0);
    expect(swapPropFrame(SWAP_LEN)[0]).toBe(0);
  });
});

describe('exit', () => {
  test('a letter still landing settles before the collapse', () => {
    expect(letterFrame(5, INTRO_END, 0.4, 0.12)[5]).toBeCloseTo(1, 2);
  });

  test('the word collapses into a centred u, which zooms out and lifts off Home', () => {
    const u = letterFrame(0, INTRO_END, IDLE, 0.8);
    expect(u[0]).toBeCloseTo(95, 1); // the u's centre to the mark's centre
    expect(u[1]).toBeCloseTo(-5.5, 1);
    LETTERS.forEach((_, i) => i && expect(letterFrame(i, INTRO_END, IDLE, 0.66)[5]).toBe(0)); // gone by the collapse's end
    const end = letterFrame(0, INTRO_END, IDLE, EXIT_END);
    expect(end[2]).toBeCloseTo(70, 1);
    expect(end[5]).toBe(0);
    expect(groundOpacity(EXIT_END)).toBe(0);
    expect(glassFrame(INTRO_END, EXIT_END)[1]).toBeCloseTo(1.6, 2);
  });
});
