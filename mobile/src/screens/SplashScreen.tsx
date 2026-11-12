import React, { useEffect, useState } from 'react';
import { PixelRatio, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { cosmosFont, cosmosFor } from '../theme/cosmos';
import { launchScheme } from '../context/ThemeContext';

interface SplashScreenProps {
  onAnimationComplete?: () => void;
  shouldExit?: boolean;
}

/**
 * The wordmark rises in as vertical slices, GSAP SplitText-style (it's a PNG, so
 * no real letters). Slices are whole device pixels wide: on Android's fractional
 * densities Yoga's rounding otherwise leaves 1px steps between them at rest.
 */
const SLICES = 8;
const SLICE_W = PixelRatio.roundToNearestPixel(176 / SLICES);
// Brand wordmark PNG is 2400×551; render it at a fixed, calm size (~176pt).
const MARK_W = SLICE_W * SLICES;
const MARK_H = Math.round((MARK_W * 551) / 2400);
const TAGLINE = 'Every fest. One app.';
const LINE_H = 18;
const TRACK_W = 56;
const RUNNER_W = TRACK_W / 2;
/**
 * Minimum time on screen, even if auth resolves instantly: long enough for the
 * intro to settle and the light to cross the wordmark once (ends ~2.6s).
 */
const MIN_VISIBLE_MS = 2600;

/**
 * The intro as a GSAP timeline: one playhead in seconds, every tween placed at
 * a position (`at`), pieces staggered left to right. Retime the splash here.
 */
const INTRO = {
  sky: { at: 0, dur: 1.6 },
  mark: { at: 0.2, dur: 0.9, stagger: 0.05 },
  words: { at: 0.7, dur: 0.8, stagger: 0.09 },
  footer: { at: 1.0, dur: 0.8 },
  track: { at: 1.1, dur: 0.6 },
  sweep: { at: 1.5 }, // once the last slice has landed (1.45s)
  runner: { at: 1.7 }, // once the track has drawn
};
const INTRO_END = 1.8;

/** The way out: words then slices lift out of their clips, under a short fade. */
const OUTRO = {
  words: { at: 0, dur: 0.35, stagger: 0.04 },
  mark: { at: 0.05, dur: 0.35, stagger: 0.025 },
  fade: { at: 0.2, dur: 0.4 },
};
const OUTRO_END = OUTRO.fade.at + OUTRO.fade.dur;

type Tween = { at: number; dur: number };

/** GSAP's stagger: one tween per piece, `stagger` s apart. Built once, so re-renders never restart them. */
const staggered = ({ at, dur, stagger }: Tween & { stagger: number }, n: number): Tween[] =>
  Array.from({ length: n }, (_, i) => ({ at: at + i * stagger, dur }));
const WORDS = TAGLINE.split(' ');
const MARK_IN = staggered(INTRO.mark, SLICES);
const MARK_OUT = staggered(OUTRO.mark, SLICES);
const WORDS_IN = staggered(INTRO.words, WORDS.length);
const WORDS_OUT = staggered(OUTRO.words, WORDS.length);

/** How far a tween is (0–1) at playhead `t`: GSAP's position parameter. */
const phase = (t: number, at: number, dur: number) => {
  'worklet';
  return Math.min(Math.max((t - at) / dur, 0), 1);
};
// GSAP's eases exactly (its powerN is one degree up: power3 = quart).
const power3Out = (p: number) => {
  'worklet';
  return 1 - Math.pow(1 - p, 4);
};
const power4Out = (p: number) => {
  'worklet';
  return 1 - Math.pow(1 - p, 5);
};
const power2In = (p: number) => {
  'worklet';
  return p * p * p;
};
const expoOut = (p: number) => {
  'worklet';
  return p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
};

/**
 * Launch splash in the 2026 brand (same sky as the login), choreographed like a
 * GSAP timeline: the blue glow rises, the silver wordmark rises slice by slice
 * from behind its baseline, the tagline follows word by word, and a light
 * sweeps the letters while a thin line runs until auth loads. Leaves by lifting
 * the type out of its clips under a short fade, not a zoom.
 */
export default function SplashScreen({ onAnimationComplete, shouldExit = false }: SplashScreenProps) {
  // Follows the OS, not the in-app theme: the native launch frame before it can
  // only follow the OS (iOS systemBackgroundColor, Android values/values-night
  // launch_background), so matching it is what keeps the handoff seamless. The
  // fade-out then reveals the app in the user's chosen theme.
  const c = cosmosFor(launchScheme);
  const isDark = c.scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [ready, setReady] = useState(false);

  // Playheads start at 0, so frame one is the bare ground: the native launch frame.
  const t = useSharedValue(0);
  const out = useSharedValue(0);
  const sweep = useSharedValue(-1);
  const runner = useSharedValue(0);

  // ── Intro ────────────────────────────────────────────────────────────────
  useEffect(() => {
    t.value = withTiming(INTRO_END, { duration: INTRO_END * 1000, easing: Easing.linear });
    // A light passes across the wordmark, then again every so often while we wait.
    sweep.value = withDelay(
      INTRO.sweep.at * 1000,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
          withDelay(1100, withTiming(-1, { duration: 0 })),
        ),
        -1,
      ),
    );
    runner.value = withDelay(
      INTRO.runner.at * 1000,
      withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), -1),
    );

    const timer = setTimeout(() => setReady(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Outro ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldExit || !ready) return;
    // The fade ends last, so it alone hands over; everything else is done by then.
    out.value = withTiming(OUTRO_END, { duration: OUTRO_END * 1000, easing: Easing.linear }, (done) => {
      if (done && onAnimationComplete) runOnJS(onAnimationComplete)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldExit, ready]);

  // ── Styles ───────────────────────────────────────────────────────────────
  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - phase(out.value, OUTRO.fade.at, OUTRO.fade.dur) }));
  // The whole sky drifts up 48pt as it fades in, so the blue glow "rises".
  const skyStyle = useAnimatedStyle(() => {
    const p = expoOut(phase(t.value, INTRO.sky.at, INTRO.sky.dur));
    return { opacity: p, transform: [{ translateY: (1 - p) * 48 }] };
  });
  // The light is pinned to the resting wordmark, so it goes before the slices lift.
  const sheenStyle = useAnimatedStyle(() => ({ opacity: 1 - phase(out.value, 0, 0.15) }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * MARK_W }],
  }));
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: power3Out(phase(t.value, INTRO.track.at, INTRO.track.dur)) }],
  }));
  const runnerStyle = useAnimatedStyle(() => ({
    // Enters fully off the left edge and exits fully off the right, so the loop never pops.
    transform: [{ translateX: -RUNNER_W + runner.value * (TRACK_W + RUNNER_W) }],
  }));

  const source = isDark
    ? require('../../assets/brand/wordmark-silver.png')
    : require('../../assets/brand/wordmark-ink.png');

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.bg }, rootStyle]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, skyStyle]}>
        <CosmosBackdrop scheme={c.scheme} />
      </Animated.View>

      <View style={styles.mark} accessible accessibilityRole="image" accessibilityLabel="Unifesto">
        {Array.from({ length: SLICES }, (_, i) => (
          <Rise
            key={i}
            t={t}
            out={out}
            dist={MARK_H}
            ease={power4Out}
            enter={MARK_IN[i]}
            exit={MARK_OUT[i]}
            clip={[styles.slice, { left: i * SLICE_W }]}
          >
            <Image source={source} style={[styles.mark, { marginLeft: -i * SLICE_W }]} contentFit="contain" />
          </Rise>
        ))}
        {/* The wordmark is the mask; the light only shows where the letters are.
            Silver only: a white sweep over the ink wordmark reads as a grey smear. */}
        {isDark && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheenStyle]}>
            <MaskedView
              style={styles.mark}
              maskElement={<Image source={source} style={styles.mark} contentFit="contain" />}
            >
              <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
                <LinearGradient
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                  start={{ x: 0, y: 0.2 }}
                  end={{ x: 1, y: 0.8 }}
                  style={styles.sweep}
                />
              </Animated.View>
            </MaskedView>
          </Animated.View>
        )}
      </View>

      <View style={styles.words} accessible accessibilityRole="text" accessibilityLabel={TAGLINE}>
        {WORDS.map((word, i) => (
          <Rise key={i} t={t} out={out} dist={LINE_H} ease={power3Out} enter={WORDS_IN[i]} exit={WORDS_OUT[i]}>
            {/* Fixed size: each clip hides exactly one 18pt line, so OS text scaling
                would show the type on frame one. The row's label carries the words. */}
            <Text maxFontSizeMultiplier={1} style={[styles.tagline, { color: c.muted }]}>
              {word}
            </Text>
          </Rise>
        ))}
      </View>

      {/* 14% up, but always above the footer: a landscape phone ran the line through it. */}
      <Animated.View
        style={[styles.track, { backgroundColor: c.border, bottom: Math.max(height * 0.14, insets.bottom + 72) }, trackStyle]}
      >
        <Animated.View style={[styles.runner, { backgroundColor: c.primary }, runnerStyle]} />
      </Animated.View>

      <Rise
        t={t}
        out={out}
        dist={LINE_H}
        ease={power3Out}
        enter={INTRO.footer}
        clip={[styles.footer, { bottom: insets.bottom + 28 }]}
      >
        <Text maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.footerText, { color: c.muted }]}>
          Built by organisers who lived the chaos
        </Text>
      </Rise>
    </Animated.View>
  );
}

/**
 * GSAP's mask reveal: rises into view from behind its own clip edge on the
 * playhead `t`, and lifts out of the top on `out`. Transform only, UI thread.
 */
function Rise({
  t,
  out,
  enter,
  exit,
  dist,
  ease,
  clip,
  children,
}: {
  t: SharedValue<number>;
  out: SharedValue<number>;
  enter: Tween;
  exit?: Tween;
  dist: number;
  ease: (p: number) => number;
  clip?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const p = ease(phase(t.value, enter.at, enter.dur));
    const q = exit ? power2In(phase(out.value, exit.at, exit.dur)) : 0;
    return { transform: [{ translateY: (1 - p - q) * dist }] };
  });
  return (
    <View style={[styles.clip, clip]}>
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK_W, height: MARK_H },
  slice: { position: 'absolute', top: 0, width: SLICE_W, height: MARK_H },
  clip: { overflow: 'hidden' },
  sweep: { width: MARK_W * 0.6, height: '100%' },
  words: { flexDirection: 'row', columnGap: 4, marginTop: 18 },
  tagline: { fontSize: 12, lineHeight: LINE_H, ...cosmosFont.strong },
  track: {
    position: 'absolute',
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    transformOrigin: 'left',
  },
  runner: { width: RUNNER_W, height: 3, borderRadius: 2 },
  footer: { position: 'absolute', left: 24, right: 24 },
  footerText: { textAlign: 'center', fontSize: 12, lineHeight: LINE_H, ...cosmosFont.body },
});
