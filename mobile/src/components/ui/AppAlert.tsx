import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop, CardSurfaceProvider } from './CardSurface';

/**
 * Themed drop-in for React Native's `Alert.alert`: same arguments, same
 * button styles, but rendered as a glass bottom card (Liquid Glass on iOS 26+,
 * frosted blur elsewhere) that matches the app instead of the system dialog.
 *
 *   AppAlert.alert('Delete?', 'This cannot be undone.', [
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'Delete', style: 'destructive', onPress: remove },
 *   ]);
 *
 * Needs <AppAlertHost /> mounted once near the root. If it isn't (very early
 * boot), calls fall back to the native alert so nothing is ever swallowed.
 */

export interface AppAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  isPreferred?: boolean;
}

export interface AppAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
}

let push: ((req: AlertRequest) => void) | null = null;
let seq = 0;

export const AppAlert = {
  alert(title: string, message?: string, buttons?: AppAlertButton[], options?: AppAlertOptions) {
    const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    if (!push) {
      Alert.alert(title, message, list, options);
      return;
    }
    push({ id: ++seq, title, message, buttons: list, options });
  },
};

const CLOSE_MS = 160;
/** How far below its resting spot the card starts / exits (it slides, never fades). */
const SLIDE = 420;

/** Which button carries the filled accent: preferred, else the last non-cancel default. */
function primaryIndex(buttons: AppAlertButton[]): number {
  const preferred = buttons.findIndex((b) => b.isPreferred);
  if (preferred >= 0) return preferred;
  for (let i = buttons.length - 1; i >= 0; i--) {
    if (buttons[i].style !== 'cancel' && buttons[i].style !== 'destructive') return i;
  }
  return -1;
}

export function AppAlertHost() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const closing = useRef(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    push = (req) => setQueue((q) => [...q, req]);
    return () => {
      push = null;
    };
  }, []);

  const current = queue[0];

  // Animate each alert in as it reaches the front of the queue.
  useEffect(() => {
    if (!current) return;
    closing.current = false;
    progress.value = 0;
    progress.value = withSpring(1, { damping: 20, stiffness: 260, mass: 0.8 });
  }, [current?.id, progress]);

  const close = useCallback(
    (after?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.quad) });
      setTimeout(() => {
        setQueue((q) => q.slice(1));
        // Run the handler once the card is gone, so it can open another
        // alert, navigate or present a sheet without fighting this modal.
        after?.();
      }, CLOSE_MS + 10);
    },
    [progress],
  );

  const onBackdrop = useCallback(() => {
    if (!current || current.options?.cancelable === false) return;
    const cancel = current.buttons.find((b) => b.style === 'cancel');
    if (cancel) close(cancel.onPress);
    else if (current.buttons.length === 1) close(current.buttons[0].onPress);
    else if (current.options?.cancelable) close(current.options.onDismiss);
  }, [current, close]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // No opacity here: anything < 1 on the card breaks Liquid Glass, so it slides in instead.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SLIDE }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  if (!current) return null;

  // Cancel always sits last (bottom of the stack / left of a pair).
  const ordered = [
    ...current.buttons.filter((b) => b.style !== 'cancel'),
    ...current.buttons.filter((b) => b.style === 'cancel'),
  ];
  const primary = primaryIndex(ordered);
  const inRow = ordered.length === 2 && ordered.every((b) => (b.text ?? 'OK').length <= 14);
  const rowOrder = inRow ? [...ordered].reverse() : ordered;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onBackdrop}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onBackdrop} accessibilityLabel="Dismiss" />
        </Animated.View>

        <Animated.View
          style={[styles.card, { marginBottom: insets.bottom + spacing[3] }, cardStyle]}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          {/* Always glass: the alert floats over real content, so the frosted fallback reads too. */}
          <CardSurfaceProvider kind="glass">
            <CardBackdrop shape={styles.card} opaque />
          </CardSurfaceProvider>
          <Text style={[styles.title, { color: tokens.text }]}>{current.title}</Text>
          {current.message ? <Text style={[styles.message, { color: tokens.textSecondary }]}>{current.message}</Text> : null}

          <View style={[styles.actions, inRow && styles.actionsRow]}>
            {rowOrder.map((b, i) => {
              const isPrimary = ordered.indexOf(b) === primary;
              const destructive = b.style === 'destructive';
              const bg = destructive ? tokens.danger : isPrimary ? tokens.accent : tokens.fill;
              const fg = destructive || isPrimary ? '#ffffff' : tokens.text;
              return (
                <Pressable
                  key={`${b.text ?? 'OK'}-${i}`}
                  onPress={() => close(b.onPress)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    inRow && styles.flex,
                    { backgroundColor: bg, transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
                    {b.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  // Lighter than a solid-card scrim so the screen still shows through the glass.
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  card: {
    marginHorizontal: spacing[3],
    borderRadius: 24,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    paddingBottom: spacing[4],
  },
  title: { fontSize: typography.fontSize.xl, letterSpacing: -0.3, ...font('heading') },
  message: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.45,
    ...font(),
  },
  actions: { marginTop: spacing[6], gap: spacing[2] },
  actionsRow: { flexDirection: 'row' },
  button: {
    height: 50,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  buttonText: { fontSize: typography.fontSize.base, ...font('semibold') },
});
