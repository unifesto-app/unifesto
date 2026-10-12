import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import MemberRow, { SPACE_ROLE_LABEL } from '../components/manage/MemberRow';
import { AppAlert } from '../components/ui/AppAlert';
import { addSpaceMember, searchAddableUsers, type MemberUser, type SpaceMemberRole } from '../lib/api/spaceMembers';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import SearchField from '../components/manage/SearchField';
import { GUTTER } from '../components/home/Section';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/**
 * Find someone on Unifesto who isn't in the space yet and add them as a
 * Member or Space admin. Stays open after each add, so several people can be
 * added in one go; added people drop out of the results.
 */
export default function AddSpaceMemberScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const c = useCosmos();
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
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <FlatList
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        data={results}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <SearchField value={query} onChangeText={setQuery} placeholder="Find someone" autoFocus busy={searching} />

            {added.length > 0 ? (
              <View style={[styles.added, { backgroundColor: c.raised }]} accessibilityLiveRegion="polite">
                {added.map((a) => (
                  <View key={a.id} style={styles.addedRow}>
                    <CheckCircle size={20} color={c.success} weight="fill" />
                    <Text style={[styles.addedText, { color: c.text }]} numberOfLines={1}>
                      {a.name} <Text style={{ color: c.muted }}>as {SPACE_ROLE_LABEL[a.role].toLowerCase()}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {hint ? <Text style={[styles.hint, { color: error ? c.danger : c.muted }]}>{hint}</Text> : null}
          </View>
        }
        // One card for all results: each row is a segment of it.
        renderItem={({ item, index }) => (
          <View style={cardSegment(c.raised, index, results.length)}>
            {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
            <MemberRow user={item} trailing="Add" busy={addingId === item.id} onPress={() => choose(item)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  added: { marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[4], gap: spacing[3] },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  addedText: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  hint: {
    marginTop: spacing[4],
    marginBottom: spacing[3],
    marginHorizontal: spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...cosmosFont.body,
  },
  // Starts under the name: past the 40pt avatar and its gap.
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
});
