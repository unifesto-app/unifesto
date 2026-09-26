import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useHeaderHeight, useNavigation } from 'expo-router/react-navigation';

/**
 * Returns the top padding to apply to scroll content that sits beneath a
 * transparent navigation header.
 *
 * `useHeaderHeight()` is measured against the screen's real safe area on both
 * platforms, so it already includes the status bar whenever the content draws
 * under it (always on Android 15+ edge-to-edge) and excludes it when it
 * doesn't. An old Android-only `StatusBar.currentHeight + 44` add-on predated
 * that and double-counted the status bar, leaving a big gap on every pushed
 * screen, so there is no platform special case any more.
 *
 * Every pushed screen calls this, so it also keeps the header's iOS 26 blur
 * switched off (see useKeepHeaderEdgeHidden).
 *
 * @param extra Additional spacing below the header (default 20).
 */
export default function useTopSpacing(extra: number = 20): number {
  const headerHeight = useHeaderHeight();
  useKeepHeaderEdgeHidden();
  return headerHeight + extra;
}

/**
 * react-native-screens hides the iOS 26 "scroll edge" blur under the header
 * (`scrollEdgeEffects.top: 'hidden'`, set in stackHeader.tsx) only when the
 * screen is pushed or that option changes, and only on a ScrollView that
 * already exists as the screen's first child. Screens that show a loading
 * view first get their ScrollView later, so it keeps the default blur: the
 * semi-transparent header.
 *
 * After the screen's content settles we re-send the option with the (unused,
 * invisible for vertical lists) left edge flipped. That change makes
 * react-native-screens re-apply every edge, top included, to the ScrollView
 * that is there now. Our own re-send is skipped so it can't loop.
 */
function useKeepHeaderEdgeHidden() {
  const navigation = useNavigation();
  const flips = useRef(0);
  const lastFlipAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // A commit right after our own re-send is (most likely) caused by it.
    if (Date.now() - lastFlipAt.current < 80) return;
    if (flips.current >= 40) return; // hard stop, just in case
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flips.current += 1;
      lastFlipAt.current = Date.now();
      navigation.setOptions({
        scrollEdgeEffects: { top: 'hidden', left: flips.current % 2 ? 'soft' : 'automatic' },
      } as object);
    }, 120);
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
