import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSubSpaceAnalytics, treeOrder, type SubSpaceAnalytics } from '../lib/api/subSpaces';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { inrShort } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * Everything beneath a parent space, rolled up: totals first, then each
 * sub-space indented under its parent. Tapping one opens its public page.
 */
export default function SubSpacesScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [data, setData] = useState<SubSpaceAnalytics | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('SubSpaces');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const res = await getSubSpaceAnalytics(spaceId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.message);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data) {
    return (
      <CosmosScreen>
        <View style={styles.pad}>
          {error ? (
            <View style={[styles.card, { backgroundColor: c.raised }]}>
              <Text style={[styles.note, { color: c.soft }]}>{error}</Text>
              <AuthButton label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : (
            <>
              <Skeleton width="100%" height={84} borderRadius={cosmosCardRadius} />
              <Skeleton width="100%" height={84} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[3] }} />
              <Skeleton width="100%" height={200} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
            </>
          )}
        </View>
      </CosmosScreen>
    );
  }

  const t = data.totals;
  const rows = treeOrder(data.subSpaces);

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.pad}>
        <ManageStats
          stats={[
            { label: 'Sub-spaces', value: t.subSpaces },
            { label: 'Members', value: t.members },
            { label: 'Events', value: t.events },
          ]}
        />
        <View style={{ marginTop: spacing[3] }}>
          <ManageStats
            stats={[
              { label: 'Upcoming', value: t.upcomingEvents },
              { label: 'Registrations', value: t.registrations },
              { label: 'Revenue', value: inrShort(t.revenue) },
            ]}
          />
        </View>
      </View>

      <Section title="Sub-spaces" subtitle="Each one under its parent. Tap to open its page" style={styles.firstSection}>
        <SettingsGroup plain style={styles.group}>
          {rows.length === 0 ? <SettingsRow label="No sub-spaces yet" /> : null}
          {rows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/space/${r.slug}`)}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}, ${r.members} members, ${r.events} events`}
              style={({ pressed }) => [styles.row, { paddingLeft: spacing[4] + (r.depth - 1) * spacing[5], opacity: pressed ? 0.6 : 1 }]}
            >
              {r.depth > 1 ? <View style={[styles.branch, { backgroundColor: c.outline }]} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.sub, { color: c.muted }]} numberOfLines={2}>
                  {r.members.toLocaleString('en-IN')} members · {r.events} events · {r.upcomingEvents} upcoming ·{' '}
                  {r.registrations.toLocaleString('en-IN')} registrations
                  {r.status !== 'ACTIVE' ? ` · ${r.status.toLowerCase()}` : ''}
                </Text>
              </View>
              <CaretRight size={15} color={c.muted} />
            </Pressable>
          ))}
        </SettingsGroup>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  note: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  firstSection: { marginTop: spacing[10] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingRight: spacing[4], paddingVertical: spacing[3], minHeight: 64 },
  // A short tick marks a child row: depth reads from the indent, not an arrow glyph.
  branch: { width: 10, height: StyleSheet.hairlineWidth * 2 },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sub: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
});
