import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDown, Check, MagnifyingGlass } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { SheetBackdrop } from '../ui/CardSurface';

interface SelectRowProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Adds a "None" choice that clears the value. */
  clearable?: boolean;
}

/**
 * A dropdown line inside a `SettingsGroup plain`: "State ........ Telangana ⌄".
 * Tapping opens a searchable sheet, for lists too long for chips. A saved value
 * that isn't in the list (typed on the web before) is still shown as is.
 */
export default function SelectRow({ label, value, options, onChange, placeholder = 'Choose', clearable }: SelectRowProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
      >
        <Text style={[styles.label, { color: tokens.text }]}>{label}</Text>
        <Text style={[styles.value, { color: value ? tokens.text : tokens.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <CaretDown size={15} color={tokens.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay }]} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[2], top: insets.top + spacing[16] }]}>
          <SheetBackdrop radius={borderRadius.xl} />
          <Text style={[styles.title, { color: tokens.text }]}>{label}</Text>
          <View style={[styles.search, { backgroundColor: tokens.fill }]}>
            <MagnifyingGlass size={18} color={tokens.textMuted} weight="bold" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              autoCorrect={false}
              style={[styles.searchInput, { color: tokens.text }]}
            />
          </View>
          <FlatList
            data={clearable && !query ? ['', ...list] : list}
            keyExtractor={(o) => o || '__none'}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = item === value;
              return (
                <Pressable onPress={() => pick(item)} style={({ pressed }) => [styles.option, pressed && { backgroundColor: tokens.pressed }]}>
                  <Text style={[styles.optionText, { color: item ? tokens.text : tokens.textMuted }]}>{item || 'None'}</Text>
                  {on ? <Check size={18} color={tokens.accent} weight="bold" /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={[styles.empty, { color: tokens.textMuted }]}>No match</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  label: { fontSize: typography.fontSize.base, ...font('medium') },
  value: { flex: 1, textAlign: 'right', fontSize: typography.fontSize.base, ...font('medium') },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, paddingTop: spacing[5] },
  title: { paddingHorizontal: spacing[6], fontSize: typography.fontSize.lg, ...font('heading') },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginHorizontal: spacing[6], marginTop: spacing[4], marginBottom: spacing[2], height: 44, paddingHorizontal: spacing[4], borderRadius: borderRadius.xl },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[6], minHeight: 52 },
  optionText: { fontSize: typography.fontSize.base, ...font() },
  empty: { textAlign: 'center', paddingVertical: spacing[8], fontSize: typography.fontSize.sm, ...font() },
});
