import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

interface MultiChipsProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}

/** Wrapping row of multi-select chips (same look as ChipPicker). */
export default function MultiChips({ options, value, onChange }: MultiChipsProps) {
  const tokens = useTokens();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
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

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  label: { fontSize: typography.fontSize.sm, ...font('medium') },
});
