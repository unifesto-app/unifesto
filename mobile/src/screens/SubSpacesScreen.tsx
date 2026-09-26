import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSubSpaceAnalytics, treeOrder, type SubSpaceAnalytics } from '../lib/api/subSpaces';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { inrShort } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * Everything beneath a parent space, rolled up: totals first, then each
 * sub-space indented under its parent. Tapping one opens its public page.
 */
export default function SubSpacesScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
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

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const t = data.totals;
  const rows = treeOrder(data.subSpaces);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
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

      <SettingsGroup title="Sub-spaces" plain>
        {rows.length === 0 ? <SettingsRow label="No sub-spaces yet" /> : null}
        {rows.map((r) => (
          <View key={r.id} style={{ paddingLeft: (r.depth - 1) * spacing[4] }}>
            <SettingsRow
              label={r.depth > 1 ? `↳ ${r.name}` : r.name}
              value={`${r.members.toLocaleString('en-IN')} members`}
              onPress={() => router.push(`/space/${r.slug}`)}
            />
            <Text style={[styles.sub, { color: tokens.textMuted, paddingLeft: spacing[4] }]}>
              {r.events} events · {r.upcomingEvents} upcoming · {r.registrations.toLocaleString('en-IN')} registrations
              {r.status !== 'ACTIVE' ? ` · ${r.status.toLowerCase()}` : ''}
            </Text>
          </View>
        ))}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  sub: { marginTop: -spacing[2], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
});
