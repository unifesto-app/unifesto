import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cosmosFont, cosmosFor } from '../theme/cosmos';
import { launchScheme } from '../context/ThemeContext';
import { launchGate } from '../lib/launchGate';
import {
  BOX,
  EXIT_END,
  INTRO_END,
  INTRO_PROPS,
  LETTERS,
  MARK_H,
  MARK_W,
  ORIGIN,
  SWAP_PROPS,
  footerOpacity,
  glassFrame,
  glowBands,
  groundOpacity,
  introPropFrame,
  letterFrame,
  swapPropFrame,
  swapSequence,
  type PropShape,
} from './splashMotion';

interface SplashScreenProps {
  onAnimationComplete?: () => void;
  /** Auth has loaded. */
  shouldExit?: boolean;
}

/** On screen at least this long from mount, even if auth is instant. */
const HOLD_MS = 2600;
/** Home mounts this long before the exit starts, so its first render lands in the hold, not the motion. */
const SETTLE_MS = 350;
/** Never stuck: leave by this time even if auth never loads. */
const CAP_MS = 12000;
/** Wait this long at most for the letter images before starting (they are bundled; it is a few ms). */
const IMAGE_WAIT_MS = 300;
/** The loader's clock runs this far at most; the cap ends the splash long before. */
const LOOP_MAX = 30;
/** The display's corner radius, roughly, so the glass rims follow the screen. */
const GLASS_RADIUS = 54;

const LETTER_IMAGES = {
  dark: [
    require('../../assets/brand/letters/silver-u.png'),
    require('../../assets/brand/letters/silver-n.png'),
    require('../../assets/brand/letters/silver-i.png'),
    require('../../assets/brand/letters/silver-f.png'),
    require('../../assets/brand/letters/silver-e.png'),
    require('../../assets/brand/letters/silver-s.png'),
    require('../../assets/brand/letters/silver-t.png'),
    require('../../assets/brand/letters/silver-o.png'),
  ],
  light: [
    require('../../assets/brand/letters/ink-u.png'),
    require('../../assets/brand/letters/ink-n.png'),
    require('../../assets/brand/letters/ink-i.png'),
    require('../../assets/brand/letters/ink-f.png'),
    require('../../assets/brand/letters/ink-e.png'),
    require('../../assets/brand/letters/ink-s.png'),
    require('../../assets/brand/letters/ink-t.png'),
    require('../../assets/brand/letters/ink-o.png'),
  ],
};

type Stops = [string, string, string];
/** Prop gradients: night uses the accents' own values, day their deeper day shades. */
const PROP_GRADIENTS: Record<'dark' | 'light', Record<'sky' | 'mint' | 'ivory' | 'blue', Stops>> = {
  dark: {
    sky: ['#c6ecff', '#90d5ff', '#2f6bff'],
    mint: ['#c9f5e2', '#90e4c1', '#1f7a5c'],
    ivory: ['#ffffff', '#f7f0e0', '#9a7444'],
    blue: ['#b9cfff', '#8fb4ff', '#0062ff'],
  },
  light: {
    sky: ['#7cc4f5', '#2f8fd8', '#0369a1'],
    mint: ['#7fd9b4', '#2a9c76', '#15745a'],
    ivory: ['#f0d9a8', '#c49a52', '#7a5a1e'],
    blue: ['#a9c3ff', '#5b8dff', '#0062ff'],
  },
};

/** The glass sheet's light, no accents: [colour, opacity]. */
const GLASS = {
  dark: {
    fill: [['#ffffff', 0.07], ['#ffffff', 0.012], ['#ffffff', 0.035]],
    rimIn: ['#ffffff', 0.5],
    rimOut: ['#ffffff', 0.14],
    glow: ['#ffffff', 0.07],
    edge: ['#ffffff', 0.025],
    sheen: ['#ffffff', 0.1],
  },
  light: {
    fill: [['#ffffff', 0.7], ['#ffffff', 0.22], ['#ffffff', 0.45]],
    rimIn: ['#ffffff', 1],
    rimOut: ['#1e2337', 0.1],
    glow: ['#ffffff', 0.9],
    edge: ['#1e2337', 0.045],
    sheen: ['#ffffff', 0.85],
  },
} as const;

/** A frame vector ([x, y, scale, scaleY, rotate, opacity]) as a style. Transform and opacity only. */
function frameStyle(v: number[]) {
  'worklet';
  const s = Math.max(v[2], 0.001); // a 0 scale is a singular matrix on iOS
  return {
    opacity: Math.min(Math.max(v[5], 0), 1),
    transform: [
      { translateX: v[0] },
      { translateY: v[1] },
      { rotate: `${v[4]}deg` },
      { scaleX: s },
      { scaleY: Math.max(s * v[3], 0.001) },
    ],
  };
}

const snap = PixelRatio.roundToNearestPixel;

/**
 * The launch splash (owner-approved 13 Nov 2026, from a GSAP prototype): the
 * wordmark's letters arrive one by one with props standing in for them, on a
 * full-screen sheet of liquid glass. While auth loads, a random letter at a
 * time swaps out for its prop. Then the word collapses into its u, the u takes
 * the centre, and zooms through its opening into Home, which is already
 * mounted underneath.
 *
 * All motion is a pure function of three UI-thread clocks (`splashMotion.ts`),
 * transforms and opacity only. The JS side only decides when to start, when
 * Home may mount and when to leave, with timers that guarantee it leaves.
 */
export default function SplashScreen({ onAnimationComplete, shouldExit = false }: SplashScreenProps) {
  // Follows the OS, not the in-app theme: the native launch frame before it can
  // only follow the OS, so matching it keeps the handoff seamless.
  const c = cosmosFor(launchScheme);
  const scheme = c.scheme;
  const screen = useWindowDimensions();
  const [size, setSize] = useState({ w: screen.width, h: screen.height });
  const insets = useSafeAreaInsets();
  const [seq] = useState(() => swapSequence());

  const t = useSharedValue(0);
  const loop = useSharedValue(0);
  const out = useSharedValue(0);
  const sheen = useSharedValue(0);

  const live = useRef({
    mountedAt: Date.now(),
    started: false,
    introDone: false,
    held: false,
    gateAt: 0,
    exiting: false,
    done: false,
    authReady: shouldExit,
    reduced: false,
    loaded: 0,
  });
  const onDone = useRef(onAnimationComplete);
  onDone.current = onAnimationComplete;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const finish = useCallback(() => {
    const s = live.current;
    if (s.done) return;
    s.done = true;
    launchGate.set({ appMayMount: true, done: true });
    onDone.current?.();
  }, []);

  const startExit = () => {
    const s = live.current;
    if (s.exiting) return;
    s.exiting = true;
    cancelAnimation(loop); // freezes any swap mid-way; the exit settles it
    out.value = withTiming(EXIT_END, { duration: EXIT_END * 1000, easing: Easing.linear }, (ok) => {
      if (ok) runOnJS(finish)();
    });
    // If the UI thread's callback is ever lost (cancelled, backgrounded), leave anyway.
    later(EXIT_END * 1000 + 700, finish);
  };

  // Home mounts once the intro has settled and auth has loaded (or the cap is
  // hit); the exit follows SETTLE_MS later, and never before the hold is over.
  const tick = () => {
    const s = live.current;
    if (s.exiting) return;
    const capped = Date.now() - s.mountedAt >= CAP_MS;
    if (!s.gateAt && ((s.introDone && s.authReady) || capped)) {
      s.gateAt = Date.now();
      launchGate.set({ appMayMount: true });
      later(SETTLE_MS, tick);
    }
    if (s.gateAt && ((s.held && Date.now() - s.gateAt >= SETTLE_MS) || capped)) startExit();
  };

  const start = () => {
    const s = live.current;
    if (s.started) return;
    s.started = true;
    t.value = withTiming(INTRO_END, { duration: INTRO_END * 1000, easing: Easing.linear });
    sheen.value = withDelay(1200, withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true));
    if (!s.reduced) {
      loop.value = withDelay(
        INTRO_END * 1000,
        withTiming(LOOP_MAX, { duration: LOOP_MAX * 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }),
      );
    }
    later(INTRO_END * 1000, () => {
      s.introDone = true;
      tick();
    });
  };

  const onLetterLoad = () => {
    if (++live.current.loaded === LETTERS.length) start();
  };

  useEffect(() => {
    const s = live.current;
    // Reduced motion: the intro and exit jump to their ends on their own (Reanimated
    // follows the system setting); the loader, which runs regardless, stays off.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        s.reduced = reduced;
        if (reduced) {
          cancelAnimation(loop);
          loop.value = 0;
        }
      })
      .catch(() => {});
    later(IMAGE_WAIT_MS, start);
    later(HOLD_MS, () => {
      s.held = true;
      tick();
    });
    later(CAP_MS, tick);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    live.current.authReady = shouldExit;
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldExit]);

  const groundStyle = useAnimatedStyle(() => ({ opacity: groundOpacity(out.value) }));
  const glassStyle = useAnimatedStyle(() => {
    const g = glassFrame(t.value, out.value);
    return { opacity: g[0], transform: [{ scale: g[1] }] };
  });
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 60 * sheen.value },
      { translateY: 46 * sheen.value },
      { rotate: `${-28 + 8 * sheen.value}deg` },
    ],
  }));
  const footerStyle = useAnimatedStyle(() => ({ opacity: footerOpacity(t.value, out.value) }));

  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Unifesto"
      // The window can differ from this layer's real size (Android system bars); the glass follows the layer.
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 0.5 || Math.abs(height - size.h) > 0.5) setSize({ w: width, h: height });
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }, groundStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, glassStyle]}>
          <GlassSheet w={size.w} h={size.h} scheme={scheme} />
          <View style={[StyleSheet.absoluteFill, styles.sheenClip]}>
            <Animated.View
              style={[
                styles.sheen,
                { left: -0.35 * size.w, top: -0.16 * size.h, width: 1.15 * size.w, height: 0.52 * size.h },
                sheenStyle,
              ]}
            >
              <Sheen w={1.15 * size.w} h={0.52 * size.h} scheme={scheme} />
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>

      <View style={styles.centre} pointerEvents="none">
        <View style={styles.mark}>
          {LETTERS.map((name, i) => (
            <Letter key={name} i={i} t={t} loop={loop} out={out} seq={seq} source={LETTER_IMAGES[scheme][i]} onLoad={onLetterLoad} />
          ))}
          {INTRO_PROPS.map((_, k) => (
            <IntroProp key={k} k={k} t={t} scheme={scheme} />
          ))}
          {LETTERS.map((_, i) =>
            i === 2 ? null : <SwapProp key={`s${i}`} i={i} loop={loop} out={out} seq={seq} scheme={scheme} />,
          )}
        </View>
      </View>

      <Animated.Text
        style={[styles.footer, { color: c.muted, bottom: insets.bottom + 28 }, footerStyle]}
        numberOfLines={1}
      >
        Built by organisers who lived the chaos
      </Animated.Text>
    </View>
  );
}

function Letter({
  i,
  t,
  loop,
  out,
  seq,
  source,
  onLoad,
}: {
  i: number;
  t: SharedValue<number>;
  loop: SharedValue<number>;
  out: SharedValue<number>;
  seq: number[];
  source: number;
  onLoad: () => void;
}) {
  const style = useAnimatedStyle(() => frameStyle(letterFrame(i, t.value, loop.value, out.value, seq)));
  const b = BOX[i];
  return (
    <Animated.View
      style={[
        styles.abs,
        { left: snap(b.x), top: snap(b.y), width: b.w, height: b.h, transformOrigin: ORIGIN[i] },
        style,
      ]}
    >
      <Image source={source} style={styles.fill} contentFit="fill" onLoad={onLoad} />
    </Animated.View>
  );
}

/** Places a prop centred in its host letter's box. */
function propBox(host: number, w: number, h: number) {
  const b = BOX[host];
  return { left: b.x + (b.w - w) / 2, top: b.y + (b.h - h) / 2, width: w, height: h };
}

function IntroProp({ k, t, scheme }: { k: number; t: SharedValue<number>; scheme: 'dark' | 'light' }) {
  const style = useAnimatedStyle(() => frameStyle(introPropFrame(k, t.value)));
  const p = INTRO_PROPS[k];
  return (
    <Animated.View style={[styles.abs, propBox(p.host, p.w, p.h), style]}>
      <PropArt shape={p.shape} w={p.w} h={p.h} id={`ip${k}`} scheme={scheme} />
    </Animated.View>
  );
}

function SwapProp({
  i,
  loop,
  out,
  seq,
  scheme,
}: {
  i: number;
  loop: SharedValue<number>;
  out: SharedValue<number>;
  seq: number[];
  scheme: 'dark' | 'light';
}) {
  const style = useAnimatedStyle(() => {
    const v = swapPropFrame(i, loop.value, out.value, seq);
    const s = Math.max(v[0], 0.001);
    return { opacity: v[0] > 0.001 ? 1 : 0, transform: [{ rotate: `${v[1]}deg` }, { scale: s }] };
  });
  const p = SWAP_PROPS[i];
  return (
    <Animated.View style={[styles.abs, propBox(i, p.w, p.h), style]}>
      <PropArt shape={p.shape} w={p.w} h={p.h} id={`sp${i}`} scheme={scheme} />
    </Animated.View>
  );
}

const STAR_PATH = (() => {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const r = k % 2 ? 8.5 : 19;
    const a = ((-90 + k * 36) * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join(' L')} Z`;
})();

/** The glossy props, drawn in the accents' gradients. Static; their wrapper moves them. */
const PropArt = memo(function PropArt({
  shape,
  w,
  h,
  id,
  scheme,
}: {
  shape: PropShape;
  w: number;
  h: number;
  id: string;
  scheme: 'dark' | 'light';
}) {
  const g = PROP_GRADIENTS[scheme];
  const grad = (gid: string, stops: Stops, mid: number) => (
    <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={stops[0]} />
      <Stop offset={String(mid)} stopColor={stops[1]} />
      <Stop offset="1" stopColor={stops[2]} />
    </LinearGradient>
  );
  switch (shape) {
    case 'sparkle':
      return (
        <Svg width={w} height={h} viewBox="-22 -22 44 44">
          <Defs>{grad(id, g.mint, 0.5)}</Defs>
          <Path d="M0 -22 C3 -6 6 -3 22 0 C6 3 3 6 0 22 C-3 6 -6 3 -22 0 C-6 -3 -3 -6 0 -22Z" fill={`url(#${id})`} />
        </Svg>
      );
    case 'bolt':
      return (
        <Svg width={w} height={h} viewBox="-15 -25 30 50">
          <Defs>{grad(id, g.ivory, 0.45)}</Defs>
          <Path d="M7 -24 L-12 3 H-1 L-6 24 L13 -5 H2 Z" fill={`url(#${id})`} />
        </Svg>
      );
    case 'dot':
      return (
        <Svg width={w} height={h} viewBox="-9 -9 18 18">
          <Defs>{grad(id, g.sky, 0.45)}</Defs>
          <Circle r={8} fill={`url(#${id})`} />
        </Svg>
      );
    case 'flower':
      return (
        <Svg width={w} height={h} viewBox="-20 -20 40 40">
          <Defs>
            {grad(id, g.blue, 0.5)}
            {grad(`${id}c`, g.sky, 0.45)}
          </Defs>
          <G fill={`url(#${id})`}>
            <Circle cy={-10} r={9.5} />
            <Circle cx={10} r={9.5} />
            <Circle cy={10} r={9.5} />
            <Circle cx={-10} r={9.5} />
          </G>
          <Circle r={5} fill={`url(#${id}c)`} />
        </Svg>
      );
    case 'ring':
      return (
        <Svg width={w} height={h} viewBox="-20 -20 40 40">
          <Defs>{grad(id, g.mint, 0.5)}</Defs>
          <Circle r={14} fill="none" stroke={`url(#${id})`} strokeWidth={8} />
        </Svg>
      );
    case 'arch':
      return (
        <Svg width={w} height={h} viewBox="-18 -18 36 26">
          <Defs>{grad(id, g.ivory, 0.45)}</Defs>
          <Path d="M-18 8 A18 18 0 0 1 18 8 H9 A9 9 0 0 0 -9 8 Z" fill={`url(#${id})`} />
        </Svg>
      );
    case 'squiggle':
      return (
        <Svg width={w} height={h} viewBox="-20 -12 40 24">
          <Defs>{grad(id, g.blue, 0.5)}</Defs>
          <Path
            d="M-16 4 C-12 -10 -6 -10 -4 0 S4 10 8 0 S14 -10 17 -2"
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={w} height={h} viewBox="-21 -21 42 42">
          <Defs>{grad(id, g.sky, 0.45)}</Defs>
          <Path d={STAR_PATH} fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth={3} strokeLinejoin="round" />
        </Svg>
      );
  }
});

/** A rounded rect as a path, for the rims' crisp offset bands. */
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

/**
 * The full-screen sheet of liquid glass, drawn once: a faint diagonal fill,
 * a soft glow just inside its edges (concentric strokes on the CSS inset-shadow
 * falloff the prototype used), a bright rim where light enters (top and left)
 * and a faint one where it leaves (bottom and right). Never redrawn while the
 * splash moves; its wrapper fades and scales it.
 */
const GlassSheet = memo(function GlassSheet({ w, h, scheme }: { w: number; h: number; scheme: 'dark' | 'light' }) {
  const g = GLASS[scheme];
  const r = GLASS_RADIUS;
  // CSS's 150deg gradient line, in this box's own coordinates.
  const a = (150 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = w * Math.abs(dx) + h * Math.abs(dy);
  const bands = (blur: number, colour: readonly [string, number], step: number, key: string) =>
    glowBands(blur, colour[1], step).map((b, k) => (
      <Rect
        key={`${key}${k}`}
        x={b.inset}
        y={b.inset}
        width={w - 2 * b.inset}
        height={h - 2 * b.inset}
        rx={Math.max(r - b.inset, 0)}
        fill="none"
        stroke={colour[0]}
        strokeOpacity={b.alpha}
        strokeWidth={b.width}
      />
    ));
  const box = roundRect(0, 0, w, h, r);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient
          id="splashGlassFill"
          gradientUnits="userSpaceOnUse"
          x1={w / 2 - (dx * len) / 2}
          y1={h / 2 - (dy * len) / 2}
          x2={w / 2 + (dx * len) / 2}
          y2={h / 2 + (dy * len) / 2}
        >
          <Stop offset="0" stopColor={g.fill[0][0]} stopOpacity={g.fill[0][1]} />
          <Stop offset="0.4" stopColor={g.fill[1][0]} stopOpacity={g.fill[1][1]} />
          <Stop offset="0.7" stopColor={g.fill[1][0]} stopOpacity={g.fill[1][1]} />
          <Stop offset="1" stopColor={g.fill[2][0]} stopOpacity={g.fill[2][1]} />
        </LinearGradient>
        <ClipPath id="splashGlassClip">
          <Path d={box} />
        </ClipPath>
      </Defs>
      <Path d={box} fill="url(#splashGlassFill)" />
      <G clipPath="url(#splashGlassClip)">
        {bands(120, g.edge, 10, 'e')}
        {bands(36, g.glow, 4, 'g')}
        <Path d={`${box} ${roundRect(-1.5, -1.5, w, h, r)}`} fillRule="evenodd" fill={g.rimOut[0]} fillOpacity={g.rimOut[1]} />
        <Path d={`${box} ${roundRect(2, 2, w, h, r)}`} fillRule="evenodd" fill={g.rimIn[0]} fillOpacity={g.rimIn[1]} />
      </G>
    </Svg>
  );
});

/** The glass's broad diagonal sheen; its wrapper drifts it as if the phone were tilting. */
const Sheen = memo(function Sheen({ w, h, scheme }: { w: number; h: number; scheme: 'dark' | 'light' }) {
  const [colour, opacity] = GLASS[scheme].sheen;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <RadialGradient id="splashSheen" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={colour} stopOpacity={opacity} />
          <Stop offset="1" stopColor={colour} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="url(#splashSheen)" />
    </Svg>
  );
});

const styles = StyleSheet.create({
  // Above every host (banners, notices, alerts) until it removes itself.
  root: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000 },
  abs: { position: 'absolute' },
  fill: { width: '100%', height: '100%' },
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK_W, height: MARK_H },
  sheenClip: { borderRadius: GLASS_RADIUS, overflow: 'hidden' },
  sheen: { position: 'absolute' },
  footer: { position: 'absolute', left: 24, right: 24, textAlign: 'center', fontSize: 12, lineHeight: 18, ...cosmosFont.body },
});
