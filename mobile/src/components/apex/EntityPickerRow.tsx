import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDown, Check, MagnifyingGlass, Plus } from '@unifesto/unicon/react-native';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { SheetBackdrop } from '../ui/CardSurface';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import useContentWidth from '../../hooks/useContentWidth';
import Modal from '../ui/Modal';

const OVERLAY = 'rgba(0, 0, 0, 0.6)';

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
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { inset } = useContentWidth();
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
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.tint }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
      >
        {add ? <Plus size={18} color={c.text} weight="bold" /> : null}
        <Text style={[styles.label, { color: c.text }]}>{label}</Text>
        {!add ? (
          <>
            <Text style={[styles.value, { color: value ? c.text : c.muted }]} numberOfLines={1}>
              {value || placeholder}
            </Text>
            <CaretDown size={15} color={c.muted} />
          </>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: OVERLAY }]} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { left: inset, right: inset, paddingBottom: insets.bottom + spacing[2], top: insets.top + spacing[16] }]}>
          <SheetBackdrop radius={borderRadius.xl} />
          <Text style={[styles.title, { color: c.text }]}>{label}</Text>
          <View style={[styles.search, { backgroundColor: c.tint }]}>
            <MagnifyingGlass size={18} color={c.muted} weight="bold" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={c.muted}
              selectionColor={c.text}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              style={[styles.searchInput, { color: c.text }]}
            />
            {loading ? <ActivityIndicator size="small" color={c.muted} /> : null}
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
                  accessibilityRole="button"
                  accessibilityLabel={[item.title, item.subtitle, on ? 'already added' : null].filter(Boolean).join(', ')}
                  accessibilityState={{ disabled: on }}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: c.tint }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionText, { color: c.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={[styles.optionSub, { color: c.muted }]} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Check size={18} color={c.text} weight="bold" /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: c.muted }]}>
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
  label: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  value: { flex: 1, textAlign: 'right', fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, paddingTop: spacing[5] },
  title: { paddingHorizontal: spacing[6], fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginHorizontal: spacing[6], marginTop: spacing[4], marginBottom: spacing[2], height: 44, paddingHorizontal: spacing[4], borderRadius: cosmosRadius },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[6], minHeight: 56, paddingVertical: spacing[2] },
  optionText: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  optionSub: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  empty: { textAlign: 'center', paddingVertical: spacing[8], fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
