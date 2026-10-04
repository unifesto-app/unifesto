import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { splitTags } from '../../lib/eventDraft';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface TagsFieldProps {
  label: string;
  /** Comma-separated, the shape the draft stores. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max?: number;
}

/**
 * Tags as removable chips: typing a comma or tapping return turns the text
 * into a chip. Sits inside a `SettingsGroup plain` card like a stacked FieldRow.
 */
export default function TagsField({ label, value, onChange, placeholder, max = 10 }: TagsFieldProps) {
  const tokens = useTokens();
  const [text, setText] = useState('');
  const tags = splitTags(value);
  const full = tags.length >= max;

  const commit = (raw: string) => {
    const next = splitTags([...tags, ...raw.split(',')].join(',')).slice(0, max);
    onChange(next.join(', '));
    setText('');
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.caption, { color: tokens.textMuted }]}>{label}</Text>
      <View style={styles.chips}>
        {tags.map((t) => (
          <Pressable
            key={t}
            onPress={() => onChange(tags.filter((x) => x !== t).join(', '))}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${t}`}
            hitSlop={4}
            style={({ pressed }) => [styles.chip, { backgroundColor: tokens.fill, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.chipText, { color: tokens.text }]}>{t}</Text>
            <X size={12} color={tokens.textMuted} weight="bold" />
          </Pressable>
        ))}
        {!full ? (
          <TextInput
            value={text}
            onChangeText={(v) => (v.includes(',') ? commit(v) : setText(v))}
            onSubmitEditing={() => text.trim() && commit(text)}
            onBlur={() => text.trim() && commit(text)}
            // Backspace on an empty input takes the last chip back for editing.
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !text && tags.length) {
                setText(tags[tags.length - 1]);
                onChange(tags.slice(0, -1).join(', '));
              }
            }}
            placeholder={tags.length ? 'Add another' : placeholder}
            placeholderTextColor={tokens.textMuted}
            selectionColor={tokens.accent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="submit"
            style={[styles.input, { color: tokens.text }]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[3] },
  caption: { fontSize: typography.fontSize.xs, ...font('medium') },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  chipText: { fontSize: typography.fontSize.sm, ...font('medium') },
  input: { flexGrow: 1, minWidth: 100, paddingVertical: 6, fontSize: typography.fontSize.base, ...font('medium') },
});
