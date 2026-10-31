import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDown, Check, MagnifyingGlass } from '@unifesto/unicon/react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, cosmosCardRadius, useCosmos } from '../../theme/cosmos';
import { SheetBackdrop } from '../ui/CardSurface';
import useContentWidth from '../../hooks/useContentWidth';

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
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { inset } = useContentWidth();
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
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.tint }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
      >
        <Text style={[styles.label, { color: c.text }]}>{label}</Text>
        <Text style={[styles.value, { color: value ? c.text : c.muted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <CaretDown size={15} color={c.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.6)' }]} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { left: inset, right: inset, paddingBottom: insets.bottom + spacing[2], top: insets.top + spacing[16] }]}>
          <SheetBackdrop radius={cosmosCardRadius} />
          <Text style={[styles.title, { color: c.text }]}>{label}</Text>
          <View style={[styles.search, { backgroundColor: c.tint }]}>
            <MagnifyingGlass size={18} color={c.muted} weight="bold" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={c.muted}
              selectionColor={c.primary}
              autoCorrect={false}
              style={[styles.searchInput, { color: c.text }]}
            />
          </View>
          <FlatList
            data={clearable && !query ? ['', ...list] : list}
            keyExtractor={(o) => o || '__none'}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = item === value;
              return (
                <Pressable onPress={() => pick(item)} style={({ pressed }) => [styles.option, pressed && { backgroundColor: c.tint }]}>
                  <Text style={[styles.optionText, { color: item ? c.text : c.muted }]}>{item || 'None'}</Text>
                  {on ? <Check size={18} color={c.primary} weight="bold" /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={[styles.empty, { color: c.muted }]}>No match</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  label: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  value: { flex: 1, textAlign: 'right', fontSize: typography.fontSize.base, ...cosmosFont.body },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: cosmosCardRadius, borderTopRightRadius: cosmosCardRadius, paddingTop: spacing[5] },
  title: { paddingHorizontal: spacing[6], fontSize: 17, lineHeight: 24, ...cosmosFont.strong },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginHorizontal: spacing[6], marginTop: spacing[4], marginBottom: spacing[2], minHeight: 44, paddingHorizontal: spacing[4], borderRadius: cosmosRadius },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[6], minHeight: 52 },
  optionText: { fontSize: typography.fontSize.base, ...cosmosFont.body },
  empty: { textAlign: 'center', paddingVertical: spacing[8], fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
