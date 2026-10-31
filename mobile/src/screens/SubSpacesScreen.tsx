import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight } from '@unifesto/unicon/react-native';
import { getSubSpaceAnalytics, treeOrder, type SubSpaceAnalytics } from '../lib/api/subSpaces';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import ShadeCard from '../components/ui/ShadeCard';
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
            <View style={[styles.card, { alignItems: 'center' }]}>
              <CardBackdrop shape={styles.card} />
              <Text style={[styles.note, { color: c.soft }]}>{error}</Text>
              <AuthButton label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : (
            <>
              <Skeleton width="100%" height={220} borderRadius={cosmosCardRadius} />
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
      {/* The roll-up is the screen's hero, on the Space's blue shade (figures in text). */}
      <View style={styles.pad}>
        <ShadeCard tone="blue">
          <Text style={[styles.heroLabel, { color: c.soft }]}>Registrations</Text>
          <Text style={[styles.big, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {t.registrations.toLocaleString('en-IN')}
          </Text>
          <View style={styles.grid}>
            {[
              { label: 'Sub-spaces', value: t.subSpaces.toLocaleString('en-IN') },
              { label: 'Members', value: t.members.toLocaleString('en-IN') },
              { label: 'Events', value: t.events.toLocaleString('en-IN') },
              { label: 'Upcoming', value: t.upcomingEvents.toLocaleString('en-IN') },
              { label: 'Revenue', value: inrShort(t.revenue) },
            ].map((s) => (
              <View key={s.label} style={styles.cell} accessible accessibilityLabel={`${s.label} ${s.value}`}>
                <Text style={[styles.value, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {s.value}
                </Text>
                <Text style={[styles.label, { color: c.muted }]} numberOfLines={1}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </ShadeCard>
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
              style={({ pressed }) => [styles.row, { paddingLeft: spacing[4] + (r.depth - 1) * spacing[5] }, pressed && { backgroundColor: c.tint }]}
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
  heroLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  big: { marginTop: spacing[1], fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[4], marginTop: spacing[5] },
  cell: { width: '33.33%', paddingRight: spacing[2] },
  value: { fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.figure },
  label: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
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
