import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MagnifyingGlass, X } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import MemberRow, { SPACE_ROLE_LABEL } from '../components/manage/MemberRow';
import { AppAlert } from '../components/ui/AppAlert';
import { addSpaceMember, searchAddableUsers, type MemberUser, type SpaceMemberRole } from '../lib/api/spaceMembers';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { CardBackdrop } from '../components/ui/CardSurface';

const GUTTER = spacing[6];
const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/**
 * Find someone on Unifesto who isn't in the space yet and add them as a
 * Member or Space admin. Stays open after each add, so several people can be
 * added in one go; added people drop out of the results.
 */
export default function AddSpaceMemberScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; name: string; role: SpaceMemberRole }[]>([]);
  const generation = useRef(0);

  useAnalyticsScreenTracking('AddSpaceMember');

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_CHARS || !spaceId) {
      generation.current++;
      setResults([]);
      setSearching(false);
      setError('');
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const gen = ++generation.current;
      const res = await searchAddableUsers(spaceId, term);
      if (gen !== generation.current) return;
      setSearching(false);
      if (!res.ok) {
        setError(res.denied ? 'Only Space admins can add members.' : res.message);
        setResults([]);
        return;
      }
      setError('');
      const addedIds = new Set(added.map((a) => a.id));
      setResults(res.data.users.filter((u) => !addedIds.has(u.id)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `added` is read once per search; re-searching on every add isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, spaceId]);

  const add = async (u: MemberUser, role: SpaceMemberRole) => {
    if (!spaceId) return;
    setAddingId(u.id);
    const res = await addSpaceMember(spaceId, u.id, role);
    setAddingId(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't add", res.message);
      return;
    }
    const name = u.fullName || u.username || 'Someone';
    setAdded((prev) => [{ id: u.id, name, role }, ...prev]);
    setResults((prev) => prev.filter((r) => r.id !== u.id));
  };

  const choose = (u: MemberUser) => {
    const name = u.fullName || u.username || 'this person';
    AppAlert.alert(`Add ${name}`, 'Space admins can manage events, money, members and settings.', [
      { text: 'As member', onPress: () => void add(u, 'MEMBER'), isPreferred: true },
      { text: 'As Space admin', onPress: () => void add(u, 'SPACE_ADMIN') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const term = query.trim();
  const hint =
    term.length < MIN_CHARS
      ? 'Search by name, username or email. People already in the space are hidden.'
      : error || (!searching && results.length === 0 ? 'No one found. They need a Unifesto account first.' : '');

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      data={results}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <View style={styles.search}>
            <CardBackdrop shape={styles.search} />
            <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find someone"
              placeholderTextColor={tokens.textMuted}
              style={[styles.searchInput, { color: tokens.text }]}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searching ? (
              <ActivityIndicator size="small" color={tokens.textMuted} />
            ) : query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <X size={18} color={tokens.textSecondary} weight="bold" />
              </Pressable>
            ) : null}
          </View>

          {added.length > 0 ? (
            <View style={[styles.added]}>
              <CardBackdrop shape={styles.added} />
              {added.map((a) => (
                <Text key={a.id} style={[styles.addedText, { color: tokens.text }]} numberOfLines={1}>
                  <Text style={{ color: tokens.success }}>Added  </Text>
                  {a.name} as {SPACE_ROLE_LABEL[a.role].toLowerCase()}
                </Text>
              ))}
            </View>
          ) : null}

          {hint ? <Text style={[styles.hint, { color: error ? tokens.danger : tokens.textMuted }]}>{hint}</Text> : null}
        </View>
      }
      ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
      renderItem={({ item }) => (
        <MemberRow user={item} trailing="Add" busy={addingId === item.id} onPress={() => choose(item)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 50, paddingHorizontal: spacing[4], borderRadius: borderRadius.full },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...font() },
  added: { marginTop: spacing[4], borderRadius: borderRadius.xl, padding: spacing[4], gap: spacing[2] },
  addedText: { fontSize: typography.fontSize.sm, ...font('medium') },
  hint: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
});
