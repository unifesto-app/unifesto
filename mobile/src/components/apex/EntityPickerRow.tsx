import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDown, Check, MagnifyingGlass, Plus } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export interface PickerItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface EntityPickerRowProps {
  label: string;
  /** Shown on the right of the row; empty shows the placeholder. */
  value?: string;
  placeholder?: string;
  /** Server search; called debounced once the query has 2+ characters. */
  search: (query: string) => Promise<PickerItem[]>;
  onPick: (item: PickerItem) => void;
  /** Ids already chosen (multi-pick): shown ticked and not pickable again. */
  pickedIds?: string[];
  /** "Add" style row (a plus, no chevron) for multi-pick lists. */
  add?: boolean;
}

/**
 * A line inside a `SettingsGroup plain` that opens a searchable sheet backed by
 * a server search: users, spaces, events. The SelectRow sibling for lists that
 * are too big to load up front.
 */
export default function EntityPickerRow({ label, value, placeholder = 'Choose', search, onPick, pickedIds, add }: EntityPickerRowProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const gen = ++generation.current;
    const t = setTimeout(async () => {
      const found = await search(q).catch(() => [] as PickerItem[]);
      if (gen !== generation.current) return; // a newer query won
      setItems(found);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, search]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const picked = new Set(pickedIds ?? []);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
      >
        {add ? <Plus size={18} color={tokens.accent} weight="bold" /> : null}
        <Text style={[styles.label, { color: add ? tokens.accent : tokens.text }]}>{label}</Text>
        {!add ? (
          <>
            <Text style={[styles.value, { color: value ? tokens.text : tokens.textMuted }]} numberOfLines={1}>
              {value || placeholder}
            </Text>
            <CaretDown size={15} color={tokens.textMuted} />
          </>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay }]} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing[2], top: insets.top + spacing[16] }]}>
          <Text style={[styles.title, { color: tokens.text }]}>{label}</Text>
          <View style={[styles.search, { backgroundColor: tokens.elevated }]}>
            <MagnifyingGlass size={18} color={tokens.textMuted} weight="bold" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              style={[styles.searchInput, { color: tokens.text }]}
            />
            {loading ? <ActivityIndicator size="small" color={tokens.textMuted} /> : null}
          </View>
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = picked.has(item.id);
              return (
                <Pressable
                  disabled={on}
                  onPress={() => {
                    onPick(item);
                    close();
                  }}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: tokens.pressed }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionText, { color: tokens.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={[styles.optionSub, { color: tokens.textMuted }]} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Check size={18} color={tokens.accent} weight="bold" /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: tokens.textMuted }]}>
                {query.trim().length < 2 ? 'Type at least 2 letters' : loading ? 'Searching…' : 'No match'}
              </Text>
            }
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
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[6], minHeight: 56, paddingVertical: spacing[2] },
  optionText: { fontSize: typography.fontSize.base, ...font('medium') },
  optionSub: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  empty: { textAlign: 'center', paddingVertical: spacing[8], fontSize: typography.fontSize.sm, ...font() },
});
