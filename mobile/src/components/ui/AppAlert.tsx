import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { WarningCircle } from '@unifesto/unicon/react-native';
import { cosmosFont, cosmosRadius, useCosmos, type Cosmos } from '../../theme/cosmos';
import { spacing } from '../../theme/spacing';
import { CardBackdrop, CardSurfaceProvider } from './CardSurface';
import { TopLayer } from './TopLayer';

/**
 * Themed drop-in for React Native's `Alert.alert`: same arguments, same
 * button styles, rendered as a cosmos glass card floating at the bottom
 * (Liquid Glass on iOS 26+, frosted blur elsewhere) instead of the system dialog.
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

// ── Layout ──────────────────────────────────────────────────────────────

type Variant = 'primary' | 'danger' | 'quiet';

interface LaidOutButton {
  button: AppAlertButton;
  variant: Variant;
}

/**
 * Orders and styles the buttons. Destructive actions are red; otherwise the
 * preferred action (else the last one) gets the silver fill; the rest are
 * hairline outlines. Two short buttons sit side by side (cancel on the left,
 * action on the right); anything else stacks with the action on top.
 */
function layoutButtons(buttons: AppAlertButton[]): { items: LaidOutButton[]; inRow: boolean } {
  const actions = buttons.filter((b) => b.style !== 'cancel');
  const cancels = buttons.filter((b) => b.style === 'cancel');

  // A destructive action is the red one, so nothing else gets filled beside it.
  const filled = actions.some((b) => b.style === 'destructive')
    ? null
    : actions.find((b) => b.isPreferred) ?? actions[actions.length - 1];

  const items = [...actions, ...cancels].map<LaidOutButton>((button) => ({
    button,
    variant: button.style === 'destructive' ? 'danger' : button === filled ? 'primary' : 'quiet',
  }));

  const inRow = items.length === 2 && items.every((i) => (i.button.text ?? 'OK').length <= 14);
  return { items: inRow ? items.reverse() : items, inRow };
}

// ── Host ────────────────────────────────────────────────────────────────

const CLOSE_MS = 160;
/** How far below its resting spot the card starts / exits (it slides, never fades). */
const SLIDE = 420;

export function AppAlertHost() {
  const c = useCosmos();
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

  const { items, inRow } = layoutButtons(current.buttons);
  const isDestructive = current.buttons.some((b) => b.style === 'destructive');

  return (
    <TopLayer visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onBackdrop}>
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

          {isDestructive && <WarningCircle size={28} color={c.danger} weight="fill" style={styles.glyph} />}
          <Text style={[styles.title, { color: c.text }]}>{current.title}</Text>
          {current.message ? <Text style={[styles.message, { color: c.soft }]}>{current.message}</Text> : null}

          <View style={[styles.actions, inRow && styles.actionsRow]}>
            {items.map(({ button, variant }, i) => (
              <AlertButton
                key={`${button.text ?? 'OK'}-${i}`}
                label={button.text ?? 'OK'}
                variant={variant}
                flex={inRow}
                c={c}
                onPress={() => close(button.onPress)}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </TopLayer>
  );
}

// ── Button ──────────────────────────────────────────────────────────────

/** Silver fill (the web's .btn-primary), red fill, or hairline outline. */
function AlertButton({ label, variant, flex, c, onPress }: {
  label: string;
  variant: Variant;
  flex: boolean;
  c: Cosmos;
  onPress: () => void;
}) {
  const bg = variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : 'transparent';
  const fg = variant === 'primary' ? c.primaryFg : variant === 'danger' ? '#ffffff' : c.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        flex && styles.flex,
        variant === 'quiet'
          ? { borderWidth: 1, borderColor: c.outline, backgroundColor: pressed ? c.border : 'transparent' }
          : { backgroundColor: bg, opacity: pressed ? 0.88 : 1 },
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  // Lighter than a solid-card scrim so the screen still shows through the glass.
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    marginHorizontal: spacing[3],
    borderRadius: 28,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    paddingBottom: spacing[5],
  },
  glyph: { marginBottom: spacing[3] },
  title: { fontSize: 18, lineHeight: 26, ...cosmosFont.display },
  message: { marginTop: spacing[2], fontSize: 15, lineHeight: 22, ...cosmosFont.body },
  actions: { marginTop: spacing[6], gap: spacing[2] },
  actionsRow: { flexDirection: 'row' },
  button: {
    height: 50,
    borderRadius: cosmosRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  buttonText: { fontSize: 16, ...cosmosFont.strong },
});
