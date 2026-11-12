import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { WarningCircle } from '@unifesto/unicon/react-native';
import { cosmosCardRadius, cosmosFont, useCosmos, type Cosmos } from '../../theme/cosmos';
import { SHEET_MAX, spacing } from '../../theme/spacing';
import { CardBackdrop, CardSurfaceProvider } from './CardSurface';
import { TopLayer } from './TopLayer';
import { useLaunchGate } from '../../lib/launchGate';

/**
 * Themed drop-in for React Native's `Alert.alert`: same arguments, same
 * button styles, rendered as a glass card floating at the bottom (Liquid Glass
 * on iOS 26+, frosted blur elsewhere) instead of the system dialog. Title and
 * message are centred; the buttons are rows under a full hairline, divided by
 * hairlines like every list in the app, never outlined or filled boxes.
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
let drop: ((id: number) => void) | null = null;
let seq = 0;

export const AppAlert = {
  /** Returns the alert's id, for dismiss(); 0 when the native alert showed it. */
  alert(title: string, message?: string, buttons?: AppAlertButton[], options?: AppAlertOptions): number {
    const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    if (!push) {
      Alert.alert(title, message, list, options);
      return 0;
    }
    const id = ++seq;
    push({ id, title, message, buttons: list, options });
    return id;
  },
  /** Takes an alert away unanswered (its question no longer stands), whether it's showing or queued. */
  dismiss(id: number) {
    drop?.(id);
  },
};

// ── Layout ──────────────────────────────────────────────────────────────

type Variant = 'primary' | 'danger' | 'action' | 'cancel';

interface LaidOutButton {
  button: AppAlertButton;
  variant: Variant;
}

/**
 * Orders and weighs the buttons. A destructive action reads crimson and
 * semibold; otherwise the preferred action (else the last one) is the
 * semibold one in text colour; other actions are regular text and cancel is
 * regular and softer. Two short buttons sit side by side (cancel on the left,
 * action on the right); anything else stacks with the action on top and
 * cancel last.
 */
function layoutButtons(buttons: AppAlertButton[]): { items: LaidOutButton[]; inRow: boolean } {
  const actions = buttons.filter((b) => b.style !== 'cancel');
  const cancels = buttons.filter((b) => b.style === 'cancel');

  // A destructive action is the loud one, so nothing else is weighted beside it.
  const main = actions.some((b) => b.style === 'destructive')
    ? null
    : actions.find((b) => b.isPreferred) ?? actions[actions.length - 1];

  const items = [...actions, ...cancels].map<LaidOutButton>((button) => ({
    button,
    variant:
      button.style === 'destructive' ? 'danger' : button.style === 'cancel' ? 'cancel' : button === main ? 'primary' : 'action',
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
  const width = Math.min(useWindowDimensions().width, SHEET_MAX);
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const closing = useRef(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    push = (req) => setQueue((q) => [...q, req]);
    drop = (id) => setQueue((q) => q.filter((req) => req.id !== id));
    return () => {
      push = null;
      drop = null;
    };
  }, []);

  // Its top layer draws over the launch splash, so alerts raised during it
  // (store update, account deletion) wait in the queue until it has gone.
  const { done: launched } = useLaunchGate();
  const current = launched ? queue[0] : undefined;

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
          style={[styles.card, { width: width - spacing[3] * 2, marginBottom: insets.bottom + spacing[3] }, cardStyle]}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          {/* Always glass: the alert floats over real content, so the frosted fallback reads too. */}
          <CardSurfaceProvider kind="glass">
            <CardBackdrop shape={styles.card} opaque />
          </CardSurfaceProvider>

          <View style={styles.body}>
            {isDestructive && <WarningCircle size={32} color={c.danger} weight="fill" style={styles.glyph} />}
            <Text style={[styles.title, { color: c.text }]}>{current.title}</Text>
            {current.message ? <Text style={[styles.message, { color: c.soft }]}>{current.message}</Text> : null}
          </View>

          {/* Buttons as rows: a full hairline under the text, then one between each. */}
          <View style={[styles.actions, inRow && styles.actionsRow, { borderTopColor: c.border }]}>
            {items.map(({ button, variant }, i) => (
              <AlertButton
                key={`${button.text ?? 'OK'}-${i}`}
                label={button.text ?? 'OK'}
                variant={variant}
                inRow={inRow}
                divider={i > 0}
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

/**
 * One button as a row: a centred label, weighed by its role (semibold for the
 * main or destructive action, softer for cancel), dimmed while pressed. The
 * hairline sits above it when stacked, to its left when side by side.
 */
function AlertButton({ label, variant, inRow, divider, c, onPress }: {
  label: string;
  variant: Variant;
  inRow: boolean;
  divider: boolean;
  c: Cosmos;
  onPress: () => void;
}) {
  const color = variant === 'danger' ? c.danger : variant === 'cancel' ? c.soft : c.text;
  const weight = variant === 'primary' || variant === 'danger' ? cosmosFont.strong : cosmosFont.body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        inRow && styles.flex,
        divider && (inRow ? styles.dividerLeft : styles.dividerTop),
        divider && { borderColor: c.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, weight, { color }]} numberOfLines={1}>
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
  card: { alignSelf: 'center', borderRadius: cosmosCardRadius },
  body: { alignItems: 'center', paddingHorizontal: spacing[6], paddingTop: spacing[6], paddingBottom: spacing[5] },
  glyph: { marginBottom: spacing[3] },
  title: { fontSize: 18, lineHeight: 26, textAlign: 'center', ...cosmosFont.strong },
  message: { marginTop: spacing[2], fontSize: 15, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  actions: { borderTopWidth: StyleSheet.hairlineWidth },
  actionsRow: { flexDirection: 'row' },
  button: { minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth },
  dividerLeft: { borderLeftWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: 16 },
});
