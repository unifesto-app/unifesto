import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';

interface OtpCodeInputProps {
  value: string;
  onChange: (code: string) => void;
  /** Fired when a paste or autofill completes the code (not when typed digit by digit). */
  onComplete?: (code: string) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
}

/**
 * A single hidden TextInput drives N painted cells. Keeping one real input
 * (instead of N) is what lets iOS "From Messages" / Android SMS autofill and
 * paste fill the whole code in one go.
 */
export default function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error = false,
  disabled = false,
}: OtpCodeInputProps) {
  const tokens = useTokens();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    // Typing adds one digit per change; paste and SMS/Messages autofill land
    // several at once. Only the latter auto-submits, so a typo gets a chance
    // to be fixed before it burns a verify attempt.
    const filledInOneGo = digits.length === length && digits.length - value.length > 1;
    if (filledInOneGo) onComplete?.(digits);
  };

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Verification code">
      <View style={styles.row}>
        {Array.from({ length }).map((_, i) => {
          const char = value[i] ?? '';
          const isActive = focused && !disabled && i === activeIndex && value.length < length;
          const borderColor = error
            ? tokens.danger
            : isActive
              ? tokens.accent
              : char
                ? tokens.borderStrong
                : tokens.border;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                {
                  borderColor,
                  backgroundColor: LIQUID_GLASS ? undefined : char ? tokens.elevated : tokens.surface,
                  borderWidth: isActive || error ? 1.5 : 1,
                },
              ]}
            >
              <GlassFill radius={borderRadius.lg} />
              {char ? (
                <Animated.Text style={[styles.digit, { color: tokens.text }]}>{char}</Animated.Text>
              ) : isActive ? (
                <Caret color={tokens.accent} />
              ) : null}
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        editable={!disabled}
        autoFocus
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

function Caret({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })),
      -1,
    );
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.caret, { backgroundColor: color }, animated]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  cell: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.82,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  caret: { width: 2, height: 24, borderRadius: 1 },
  // Kept on screen (not display:none) so autofill and focus still work.
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: 'transparent' },
});
