import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { CardBackdrop } from '../ui/CardSurface';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

interface MultiChipsProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}

/** Wrapping row of multi-select chips (same look as ChipPicker). */
export default function MultiChips({ options, value, onChange }: MultiChipsProps) {
  const c = useCosmos();
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
              { backgroundColor: on ? c.primary : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}
          >
            {!on ? <CardBackdrop shape={styles.chip} /> : null}
            <Text style={[styles.label, { color: on ? c.primaryFg : c.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
