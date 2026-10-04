import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

interface ChipPickerProps<V extends string> {
  options: { value: V; label: string }[];
  value: V | '';
  onChange: (v: V | '') => void;
  /** Tapping the selected chip clears it (optional fields like category). */
  clearable?: boolean;
}

/** Wrapping row of single-select chips, for lists too long for SegmentedTabs. */
export default function ChipPicker<V extends string>({ options, value, onChange, clearable }: ChipPickerProps<V>) {
  const tokens = useTokens();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(on && clearable ? '' : o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: on ? tokens.accent : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}
          >
            {!on ? <CardBackdrop shape={styles.chip} /> : null}
            <Text style={[styles.label, { color: on ? tokens.accentFg : tokens.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface MultiChipPickerProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  /** Unpicked chips dim once this many are picked. */
  max?: number;
}

/** Wrapping row of multi-select chips, kept in tap order (first = primary). */
export function MultiChipPicker({ options, value, onChange, max }: MultiChipPickerProps) {
  const tokens = useTokens();
  const full = max !== undefined && value.length >= max;
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = value.includes(o.value);
        const disabled = !on && full;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? tokens.accent : undefined,
                opacity: disabled ? 0.4 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            {!on ? <CardBackdrop shape={styles.chip} /> : null}
            <Text style={[styles.label, { color: on ? tokens.accentFg : tokens.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  label: { fontSize: typography.fontSize.sm, ...font('medium') },
});
