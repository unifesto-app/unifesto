/**
 * The launch splash's motion as pure functions of three clocks, in seconds:
 * `t` the intro, `loop` the letter swaps while auth loads, `out` the exit.
 *
 * Ported number for number from the GSAP prototype the owner approved on
 * 13 Nov 2026 (eases are GSAP's formulas, tweens are GSAP timeline segments),
 * and checked against GSAP's own values. Everything here is a worklet, so the
 * splash runs on the UI thread: a busy JS thread can delay when it starts or
 * leaves, never how it moves.
 */

/** The wordmark's letters, cut at its real gaps (f and e split at their join). */
export const LETTERS = ['u', 'n', 'i', 'f', 'e', 's', 't', 'o'] as const;
export const MARK_W = 240;
export const MARK_H = 55;
/** Each letter's box in pt inside the 240×55 mark; the images are cut to these boxes (3x). */
export const BOX = [
  { x: 9, y: 21, w: 32, h: 24 },
  { x: 41, y: 20, w: 32, h: 24 },
  { x: 73, y: 11, w: 11, h: 33 },
  { x: 82, y: 11, w: 28, h: 33 },
  { x: 108, y: 14, w: 33, h: 31 },
  { x: 140, y: 20, w: 31, h: 25 },
  { x: 168, y: 14, w: 30, h: 31 },
  { x: 196, y: 20, w: 34, h: 25 },
];
/** Each letter's pivot: the n unfolds from its foot, the t pops from its middle, the o swings from its foot. */
export const ORIGIN = ['50% 30%', '50% 100%', '50% 50%', '50% 50%', '50% 50%', '50% 50%', '50% 60%', '0% 100%'];

/** Seconds: the intro settles by INTRO_END (the loader starts then); the exit lasts EXIT_END. */
export const INTRO_END = 2.3;
export const EXIT_END = 1.45;
/** The loader: a swap starts every LOOP_EVERY seconds and lasts SWAP_LEN (so two overlap briefly). */
export const LOOP_EVERY = 0.9;
export const SWAP_LEN = 1.08;

// State vector indices: translateX, translateY, scale, scaleY (on top of scale), rotate (deg), opacity.
const X = 0;
const Y = 1;
const S = 2;
const SY = 3;
const R = 4;
const A = 5;

// GSAP eases. A segment names one by kind (and back's overshoot / elastic's period in `c`).
const NONE = 0;
const P1O = 1; // power1.out, GSAP's default
const P2O = 2;
const P3O = 3;
const P1I = 4;
const P2I = 5;
const P3I = 6;
const P2IO = 7;
const P3IO = 8;
const BACK = 9; // back.out(c)
const ELASTIC = 10; // elastic.out(1, c)

/** GSAP's ease formulas (its powerN is one degree up: power3 = quart). */
export function ease(kind: number, c: number, p: number): number {
  'worklet';
  switch (kind) {
    case P1O:
      return 1 - (1 - p) * (1 - p);
    case P2O:
      return 1 - Math.pow(1 - p, 3);
    case P3O:
      return 1 - Math.pow(1 - p, 4);
    case P1I:
      return p * p;
    case P2I:
      return p * p * p;
    case P3I:
      return p * p * p * p;
    case P2IO:
      return p < 0.5 ? Math.pow(2 * p, 3) / 2 : 1 - Math.pow(2 * (1 - p), 3) / 2;
    case P3IO:
      return p < 0.5 ? Math.pow(2 * p, 4) / 2 : 1 - Math.pow(2 * (1 - p), 4) / 2;
    case BACK: {
      const q = p - 1;
      return q * q * ((c + 1) * q + c) + 1;
    }
    case ELASTIC:
      return p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p - c / 4) * ((2 * Math.PI) / c)) + 1;
    default:
      return p;
  }
}

/** How far a segment is (0–1) at clock `t`. */
export function phase(t: number, at: number, dur: number): number {
  'worklet';
  if (dur <= 0) return t >= at ? 1 : 0;
  return Math.min(Math.max((t - at) / dur, 0), 1);
}

/** [property, from, to, at, duration, ease kind, ease param]. */
type Seg = [number, number, number, number, number, number, number];
/** A timeline track: the start state and its segments, in time order per property. */
type Track = { i: number[]; s: Seg[] };

/** The state at clock `t`: every segment that has started sets its property; the latest wins. */
export function evalTrack(track: Track, t: number): number[] {
  'worklet';
  const v = track.i.slice();
  for (let k = 0; k < track.s.length; k++) {
    const g = track.s[k];
    if (t >= g[3]) v[g[0]] = g[1] + (g[2] - g[1]) * ease(g[5], g[6], phase(t, g[3], g[4]));
  }
  return v;
}

const REST = [0, 0, 1, 1, 0, 1];

/** The intro, per letter (u n i f e s t o). */
const LETTER_INTRO: Track[] = [
  // u: rises, dips back, rises again to rest.
  { i: [0, 34, 1, 1, 0, 0], s: [[A, 0, 1, 0.15, 0.18, NONE, 0], [Y, 34, 0, 0.15, 0.3, P3O, 0], [Y, 0, 12, 0.5, 0.25, P2IO, 0], [Y, 12, 0, 0.75, 0.55, P3O, 0]] },
  // n: unfolds up from its baseline once the flower has spun away.
  { i: [0, 0, 1, 0, 0, 0], s: [[A, 0, 1, 0.72, 0.05, NONE, 0], [SY, 0, 1, 0.72, 0.5, BACK, 2.2]] },
  // i: drops from above and overshoots its seat.
  { i: [0, -34, 1, 1, 0, 0], s: [[A, 0, 1, 0.5, 0.18, NONE, 0], [Y, -34, 0, 0.5, 0.6, BACK, 1.8]] },
  // f: slides in from the left.
  { i: [-30, 0, 1, 1, 0, 0], s: [[A, 0, 1, 0.6, 0.18, NONE, 0], [X, -30, 0, 0.6, 0.6, P3O, 0]] },
  // e: rises in after the reel.
  { i: [0, 30, 1, 1, 0, 0], s: [[A, 0, 1, 1.05, 0.18, NONE, 0], [Y, 30, 0, 1.05, 0.55, BACK, 1.4]] },
  // s: rises in as the sparkle falls away.
  { i: [0, 30, 1, 1, 0, 0], s: [[A, 0, 1, 1.5, 0.18, NONE, 0], [Y, 30, 0, 1.5, 0.5, P3O, 0]] },
  // t: pops out of nothing as the bolt shrinks away.
  { i: [0, 0, 0, 1, 0, 0], s: [[A, 0, 1, 1.78, 0.05, NONE, 0], [S, 0, 1, 1.78, 0.45, BACK, 2.4]] },
  // o: swings in on a pivot at its foot, with an elastic wobble.
  { i: [0, 0, 1, 1, -120, 0], s: [[A, 0, 1, 1.08, 0.15, NONE, 0], [R, -120, 0, 1.08, 1.2, ELASTIC, 0.45]] },
];

/** A prop's look; drawn by the splash in the theme's accent gradients. */
export type PropShape = 'flower' | 'dot' | 'sparkle' | 'bolt' | 'ring' | 'arch' | 'star' | 'squiggle';
/** A prop sits centred in its host letter's box. */
export type PropSpec = { host: number; shape: PropShape; w: number; h: number; track: Track };

const reel = (k: number, shape: PropShape, size: number): PropSpec => {
  const at = 0.55 + k * 0.16;
  return {
    host: 4,
    shape,
    w: size,
    h: size,
    track: {
      i: [0, 14, 0.4, 1, 0, 0],
      s: [
        [Y, 14, 0, at, 0.14, P2O, 0], [S, 0.4, 1, at, 0.14, P2O, 0], [A, 0, 1, at, 0.14, P2O, 0],
        [Y, 0, -14, at + 0.14, 0.16, P2I, 0], [S, 1, 0.4, at + 0.14, 0.16, P2I, 0], [A, 1, 0, at + 0.14, 0.16, P2I, 0],
      ],
    },
  };
};

/** The intro's stand-in props: flower (n), the reel (e), sparkle (s), bolt (t), ring (o). */
export const INTRO_PROPS: PropSpec[] = [
  { host: 1, shape: 'flower', w: 24, h: 24, track: { i: [0, 0, 0, 1, -90, 1], s: [[S, 0, 1, 0.25, 0.35, BACK, 2], [R, -90, 0, 0.25, 0.35, BACK, 2], [S, 1, 0, 0.62, 0.2, P2I, 0], [R, 0, 120, 0.62, 0.2, P2I, 0]] } },
  reel(0, 'dot', 14),
  reel(1, 'sparkle', 22),
  reel(2, 'dot', 14),
  { host: 5, shape: 'sparkle', w: 26, h: 26, track: { i: [0, 0, 0, 1, -180, 1], s: [[S, 0, 1, 0.35, 0.6, BACK, 1.8], [R, -180, 0, 0.35, 0.6, BACK, 1.8], [Y, 0, 26, 1.35, 0.4, P2I, 0], [R, 0, 60, 1.35, 0.4, P2I, 0], [A, 1, 0, 1.35, 0.4, P2I, 0]] } },
  { host: 6, shape: 'bolt', w: 20, h: 34, track: { i: [0, 0, 0, 1, -25, 1], s: [[S, 0, 1, 0.65, 0.45, BACK, 2.5], [R, -25, 0, 0.65, 0.45, BACK, 2.5], [S, 1, 0, 1.6, 0.25, P2I, 0], [R, 0, 20, 1.6, 0.25, P2I, 0]] } },
  // Rolls in from the right (70pt on an 11pt radius is ~365°) and pops.
  { host: 7, shape: 'ring', w: 22, h: 22, track: { i: [70, 0, 1, 1, 365, 0], s: [[A, 0, 1, 0.5, 0.15, P1O, 0], [X, 70, 0, 0.5, 0.5, P3O, 0], [R, 365, 0, 0.5, 0.5, P3O, 0], [S, 1, 0, 1.02, 0.18, P2I, 0]] } },
];

/** The loader's prop for each letter (the i never swaps; its dot is unused). */
export const SWAP_PROPS: { shape: PropShape; w: number; h: number }[] = [
  { shape: 'flower', w: 22, h: 22 },
  { shape: 'arch', w: 26, h: 19 },
  { shape: 'dot', w: 11, h: 11 },
  { shape: 'bolt', w: 18, h: 30 },
  { shape: 'sparkle', w: 24, h: 24 },
  { shape: 'star', w: 22, h: 22 },
  { shape: 'squiggle', w: 26, h: 16 },
  { shape: 'ring', w: 22, h: 22 },
];

const cx = (i: number) => BOX[i].x + BOX[i].w / 2;
const U_CX = cx(0);
const U_CY = BOX[0].y + BOX[0].h / 2;

/** The exit, per letter: the others are pulled into the u; the u takes the centre, then zooms through. */
const LETTER_EXIT: Track[] = LETTERS.map((_, i) => {
  if (i === 0) {
    return {
      i: REST,
      s: [
        [X, 0, MARK_W / 2 - U_CX, 0.35, 0.45, P3IO, 0], [Y, 0, MARK_H / 2 - U_CY, 0.35, 0.45, P3IO, 0], [S, 1, 1.6, 0.35, 0.45, P3IO, 0],
        [S, 1.6, 1.45, 0.8, 0.12, P2O, 0],
        [S, 1.45, 70, 0.92, 0.5, P3I, 0],
        [A, 1, 0, 1.22, 0.2, NONE, 0],
      ] as Seg[],
    };
  }
  const at = 0.1 + (i - 1) * 0.03;
  return { i: REST, s: [[X, 0, U_CX - cx(i), at, 0.36, P3I, 0], [S, 1, 0.2, at, 0.36, P3I, 0], [A, 1, 0, at, 0.36, P3I, 0]] as Seg[] };
});

const FOOTER: Track = { i: [0, 0, 1, 1, 0, 0], s: [[A, 0, 1, 1.4, 0.8, P1O, 0]] };
const FOOTER_EXIT: Track = { i: REST, s: [[A, 1, 0, 0.05, 0.25, P1O, 0]] };
const PANE: Track = { i: [0, 0, 1.04, 1, 0, 0], s: [[A, 0, 1, 0.1, 1.4, P2O, 0], [S, 1.04, 1, 0.1, 1.4, P2O, 0]] };
const GLASS_EXIT: Track = { i: REST, s: [[S, 1, 1.6, 0.92, 0.5, P3I, 0]] };
const GROUND_EXIT: Track = { i: REST, s: [[A, 1, 0, 1.0, 0.3, P1I, 0]] };

/**
 * The loader's next letter: a random one each time, never the i, never the
 * one that just went.
 */
export function nextSwap(last: number, random: () => number = Math.random): number {
  const choices = [0, 1, 3, 4, 5, 6, 7].filter((k) => k !== last);
  return choices[Math.floor(random() * choices.length)];
}

/**
 * A letter during its swap, `local` seconds in (idle below 0 or from SWAP_LEN):
 * [translateY, opacity]. It lifts out, waits for its prop, drops back in.
 * Each letter has its own swap clock, so only the letters swapping move.
 */
function swapLetter(local: number): number[] {
  'worklet';
  if (local < 0 || local >= SWAP_LEN) return [0, 1];
  if (local < 0.2) {
    const p = ease(P2I, 0, local / 0.2);
    return [-16 * p, 1 - p];
  }
  if (local < 0.68) return [-16, 0];
  const p = ease(BACK, 1.6, (local - 0.68) / 0.4);
  return [16 - 16 * p, Math.min(Math.max(p, 0), 1)];
}

/** A swap prop, `local` seconds into its letter's swap: [scale, rotate]. */
export function swapPropFrame(local: number): number[] {
  'worklet';
  if (local < 0.15 || local >= SWAP_LEN) return [0, -60];
  if (local < 0.45) {
    const p = ease(BACK, 2.2, (local - 0.15) / 0.3);
    return [p, -60 + 60 * p];
  }
  if (local < 0.6) return [1, 0];
  const p = ease(P2I, 0, phase(local, 0.6, 0.16));
  return [1 - p, 60 * p];
}

/**
 * Letter `i` at its clocks: the intro `t`, its own swap clock `swap` (seconds
 * into its current swap; idle below 0), and the exit `out`.
 * Returns [x, y, scale, scaleY, rotate, opacity].
 */
export function letterFrame(i: number, t: number, swap: number, out: number): number[] {
  'worklet';
  const v = evalTrack(LETTER_INTRO[i], t);
  if (swap >= 0) {
    const w = swapLetter(swap);
    v[Y] = w[0];
    v[A] = w[1];
  }
  if (out > 0) {
    // A letter still landing settles first (the loader winds down before the exit, so this is a safety net).
    const settle = ease(P1O, 0, phase(out, 0, 0.12));
    v[Y] = v[Y] * (1 - settle);
    v[A] = v[A] + (1 - v[A]) * settle;
    const e = evalTrack(LETTER_EXIT[i], out);
    v[X] += e[X];
    v[Y] += e[Y];
    v[S] *= e[S];
    v[A] *= e[A];
  }
  return v;
}

/** Intro prop `k` at clock `t`. */
export function introPropFrame(k: number, t: number): number[] {
  'worklet';
  return evalTrack(INTRO_PROPS[k].track, t);
}

/** The footer's opacity. */
export function footerOpacity(t: number, out: number): number {
  'worklet';
  return evalTrack(FOOTER, t)[A] * evalTrack(FOOTER_EXIT, out)[A];
}

/** The glass sheet: [opacity, scale] (it settles in, then rushes past in the zoom). */
export function glassFrame(t: number, out: number): number[] {
  'worklet';
  const p = evalTrack(PANE, t);
  return [p[A], p[S] * evalTrack(GLASS_EXIT, out)[S]];
}

/** The ground's opacity: it lifts off Home during the zoom. */
export function groundOpacity(out: number): number {
  'worklet';
  return evalTrack(GROUND_EXIT, out)[A];
}
