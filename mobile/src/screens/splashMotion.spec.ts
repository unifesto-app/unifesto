import { describe, expect, test } from '@jest/globals';
import {
  EXIT_END,
  INTRO_END,
  INTRO_PROPS,
  LETTERS,
  LOOP_EVERY,
  SWAP_LEN,
  footerOpacity,
  glassFrame,
  groundOpacity,
  introPropFrame,
  letterFrame,
  swapPropFrame,
  swapSequence,
} from './splashMotion';

// The motion was checked frame by frame against the approved GSAP prototype
// (28k values, every 10ms of the intro and exit). These keep the parts that
// matter from drifting: rest states, the loader's rules, and a few GSAP values.

const REST = [0, 0, 1, 1, 0, 1];
const close = (a: number[], b: number[], d = 2) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], d));
const I = 2; // the i

describe('intro', () => {
  test('frame one is the bare ground: no letter, prop or footer shows', () => {
    LETTERS.forEach((_, i) => expect(letterFrame(i, 0, 0, 0, [0])[5]).toBe(0));
    INTRO_PROPS.forEach((_, k) => {
      const v = introPropFrame(k, 0);
      expect(v[2] * v[5]).toBe(0); // scale 0 or opacity 0
    });
    expect(footerOpacity(0, 0)).toBe(0);
    expect(glassFrame(0, 0)[0]).toBe(0);
  });

  test('every letter is at rest and every prop gone when the intro ends', () => {
    LETTERS.forEach((_, i) => close(letterFrame(i, INTRO_END, 0, 0, [0]), REST));
    INTRO_PROPS.forEach((_, k) => {
      const v = introPropFrame(k, INTRO_END);
      expect(v[2] * v[5]).toBeCloseTo(0, 3);
    });
  });

  test('matches GSAP at sampled moments', () => {
    expect(letterFrame(0, 0.95, 0, 0, [0])[1]).toBeCloseTo(1.968, 2); // u, power3.out
    expect(letterFrame(7, 1.25, 0, 0, [0])[4]).toBeCloseTo(17.804, 2); // o, elastic.out(1, 0.45)
    expect(letterFrame(1, 0.95, 0, 0, [0])[3]).toBeCloseTo(1.138, 2); // n, back.out(2.2)
    expect(introPropFrame(6, 0.6)[0]).toBeCloseTo(28.672, 2); // ring rolling in
    expect(footerOpacity(1.7, 0)).toBeCloseTo(0.609, 2);
  });
});

describe('loader', () => {
  test('a random letter each time: never the i, never the same one twice running', () => {
    for (let run = 0; run < 50; run++) {
      const seq = swapSequence();
      expect(seq.length).toBeGreaterThanOrEqual(30);
      expect(seq).not.toContain(I);
      seq.forEach((k, n) => n && expect(k).not.toBe(seq[n - 1]));
    }
  });

  test('a letter swaps only in its own slot and is at rest outside it', () => {
    const seq = [3, 5, 0];
    // Letter 3 (f) owns slot 0, letter 5 (s) slot 1.
    expect(letterFrame(3, INTRO_END, 0.1, 0, seq)[5]).toBeLessThan(1);
    close(letterFrame(3, INTRO_END, SWAP_LEN + 0.01, 0, seq), REST);
    close(letterFrame(5, INTRO_END, LOOP_EVERY - 0.01, 0, seq), REST);
    close(letterFrame(I, INTRO_END, 1.0, 0, seq), REST);
    // A swap lands while the next one starts.
    expect(letterFrame(3, INTRO_END, LOOP_EVERY + 0.1, 0, seq)[5]).toBeGreaterThan(0.5);
    expect(letterFrame(5, INTRO_END, LOOP_EVERY + 0.1, 0, seq)[5]).toBeLessThan(1);
  });

  test('the prop shows only while its letter is out', () => {
    const seq = [4, 0];
    expect(swapPropFrame(4, 0.1, 0, seq)[0]).toBe(0);
    expect(swapPropFrame(4, 0.5, 0, seq)[0]).toBeCloseTo(1, 2);
    expect(swapPropFrame(4, 0.8, 0, seq)[0]).toBeCloseTo(0, 3);
  });
});

describe('exit', () => {
  test('a letter caught mid-swap settles before the collapse', () => {
    const seq = [5, 0];
    expect(letterFrame(5, INTRO_END, 0.4, 0, seq)[5]).toBe(0); // out of its spot
    expect(letterFrame(5, INTRO_END, 0.4, 0.12, seq)[5]).toBeCloseTo(1, 2);
    expect(swapPropFrame(5, 0.4, 0.12, seq)[0]).toBeCloseTo(0, 3);
  });

  test('the word collapses into a centred u, which zooms out and lifts off Home', () => {
    const u = letterFrame(0, INTRO_END, 0, 0.8, [0]);
    expect(u[0]).toBeCloseTo(95, 1); // the u's centre to the mark's centre
    expect(u[1]).toBeCloseTo(-5.5, 1);
    LETTERS.forEach((_, i) => i && expect(letterFrame(i, INTRO_END, 0, 0.8, [0])[5]).toBe(0));
    const end = letterFrame(0, INTRO_END, 0, EXIT_END, [0]);
    expect(end[2]).toBeCloseTo(70, 1);
    expect(end[5]).toBe(0);
    expect(groundOpacity(EXIT_END)).toBe(0);
    expect(glassFrame(INTRO_END, EXIT_END)[1]).toBeCloseTo(1.6, 2);
  });
});
