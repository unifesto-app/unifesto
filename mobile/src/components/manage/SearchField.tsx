import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MagnifyingGlass, X } from '@unifesto/unicon/react-native';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

interface Props extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (v: string) => void;
  /** Spinner in place of the clear button while a search runs. */
  busy?: boolean;
}

/** Cosmos search field (same look as Events browse): 1px outline, card fill, clear button. */
export default function SearchField({ value, onChangeText, busy, ...input }: Props) {
  const c = useCosmos();
  return (
    <View style={[styles.field, { borderColor: c.input, backgroundColor: c.card }]}>
      <MagnifyingGlass size={18} color={c.muted} />
      <TextInput
        accessibilityLabel={input.placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        {...input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={c.muted}
        selectionColor={c.text}
        style={[styles.input, { color: c.text }]}
        accessibilityRole="search"
      />
      {busy ? (
        <ActivityIndicator size="small" color={c.muted} />
      ) : value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={12} accessibilityLabel="Clear search">
          <X size={16} color={c.soft} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: cosmosRadius,
    borderWidth: 1,
  },
  input: { flex: 1, alignSelf: 'stretch', fontSize: typography.fontSize.base, ...cosmosFont.body },
});
