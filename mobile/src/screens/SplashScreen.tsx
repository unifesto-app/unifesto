import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
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
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import CosmosBackdrop from '../components/auth/CosmosBackdrop';
import { cosmosFont, useCosmos } from '../components/auth/cosmos';

interface SplashScreenProps {
  onAnimationComplete?: () => void;
  shouldExit?: boolean;
}

// Brand wordmark PNG is 2400×551; render it at a fixed, calm size.
const MARK_W = 176;
const MARK_H = Math.round((MARK_W * 551) / 2400);
const TRACK_W = 56;
/**
 * Minimum time on screen, even if auth resolves instantly: long enough for the
 * intro to settle and the light to cross the wordmark once (ends ~2.1s).
 */
const MIN_VISIBLE_MS = 2600;

const ease = Easing.out(Easing.cubic);

/**
 * Launch splash in the 2026 brand (same night sky as the login): stars fade
 * in and the horizon rises into place, the silver wordmark lifts in with a
 * light sweeping across it, and a thin silver line runs while auth loads.
 * Leaves with a short fade, not a zoom.
 */
export default function SplashScreen({ onAnimationComplete, shouldExit = false }: SplashScreenProps) {
  // Follows the active theme. The native launch frame before it follows the OS
  // (iOS systemBackgroundColor, Android values/values-night launch_background).
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const mountedAt = useRef(Date.now());
  const [ready, setReady] = useState(false);

  const sky = useSharedValue(0);
  const mark = useSharedValue(0);
  const tagline = useSharedValue(0);
  const sweep = useSharedValue(-1);
  const progress = useSharedValue(0);
  const exit = useSharedValue(0);

  // ── Intro ────────────────────────────────────────────────────────────────
  useEffect(() => {
    sky.value = withTiming(1, { duration: 1600, easing: ease });
    mark.value = withDelay(200, withTiming(1, { duration: 900, easing: ease }));
    tagline.value = withDelay(650, withTiming(1, { duration: 700, easing: ease }));
    // A light passes across the wordmark, then again every so often while we wait.
    sweep.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
          withDelay(1100, withTiming(-1, { duration: 0 })),
        ),
        -1,
      ),
    );
    progress.value = withDelay(1000, withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), -1));

    const t = setTimeout(() => setReady(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Outro ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldExit || !ready) return;
    exit.value = withTiming(1, { duration: 500, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done && onAnimationComplete) runOnJS(onAnimationComplete)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldExit, ready]);

  // ── Styles ───────────────────────────────────────────────────────────────
  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  // The whole sky drifts up 48pt as it fades in, so the horizon "rises".
  const skyStyle = useAnimatedStyle(() => ({
    opacity: sky.value,
    transform: [{ translateY: (1 - sky.value) * 48 }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ translateY: (1 - mark.value) * 14 }, { scale: 1 - exit.value * 0.04 }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value,
    transform: [{ translateY: (1 - tagline.value) * 8 }],
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * MARK_W }],
  }));
  const trackStyle = useAnimatedStyle(() => ({ opacity: tagline.value }));
  const runnerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -TRACK_W / 2 + progress.value * TRACK_W * 1.5 - TRACK_W / 4 }],
  }));

  const wordmark = (
    <Image
      source={
        c.scheme === 'dark'
          ? require('../../assets/brand/wordmark-silver.png')
          : require('../../assets/brand/wordmark-ink.png')
      }
      style={styles.mark}
      contentFit="contain"
    />
  );

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.bg }, rootStyle]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, skyStyle]}>
        <CosmosBackdrop />
      </Animated.View>

      <Animated.View style={markStyle}>
        {/* The wordmark is the mask; the light only shows where the letters are. */}
        <MaskedView style={styles.mark} maskElement={wordmark}>
          {wordmark}
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

      <Animated.Text style={[styles.tagline, { color: c.muted }, taglineStyle]}>
        Every fest. One app.
      </Animated.Text>

      <Animated.View style={[styles.track, { backgroundColor: c.border }, trackStyle]}>
        <Animated.View style={[styles.runner, { backgroundColor: c.primary }, runnerStyle]} />
      </Animated.View>

      <Animated.Text
        style={[styles.footer, { color: c.muted, bottom: insets.bottom + 28 }, taglineStyle]}
      >
        Built by Organisers Who Lived the Chaos
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK_W, height: MARK_H },
  sweep: { width: MARK_W * 0.6, height: '100%' },
  tagline: { marginTop: 18, fontSize: 12, ...cosmosFont.display },
  track: {
    position: 'absolute',
    bottom: '14%',
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  runner: { width: TRACK_W / 2, height: 3, borderRadius: 2 },
  footer: {
    position: 'absolute',
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 12,
    ...cosmosFont.body,
  },
});
