import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getMyPartnerLinks, type MyPartnerLink } from '../lib/api/tracking';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const THUMB_W = 88;
const THUMB_H = 66; // 4:3

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every event this user is a partner on, with the registrations each link brought in. */
export default function PartnerLinksScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [links, setLinks] = useState<MyPartnerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('PartnerLinks');

  const load = useCallback(async () => {
    const res = await getMyPartnerLinks();
    if (res.ok) {
      setLinks(res.data);
      setError('');
    } else setError(res.message);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      contentInsetAdjustmentBehavior="never"
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
        />
      }
    >
      {error ? <Text style={[styles.muted, { color: tokens.danger }]}>{error}</Text> : null}
      {!error && links.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>
          When an event curator adds you as a partner, its registrations show up here.
        </Text>
      ) : null}

      {links.map((l) => (
        <Pressable
          key={l.id}
          onPress={() => router.push(`/partner/${l.id}`)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tokens.pressed : tokens.elevated }]}
          accessibilityRole="button"
          accessibilityLabel={`${l.event.title}, ${l.registrations} registrations`}
        >
          {l.event.coverImageUrl ? (
            <Image source={{ uri: l.event.coverImageUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: tokens.fill }]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{l.event.title}</Text>
            <Text style={[styles.muted, { color: tokens.textMuted }]} numberOfLines={1}>
              {when(l.event.startDateTime)} · as {l.name}
            </Text>
          </View>
          <View style={styles.count}>
            <Text style={[styles.countNum, { color: tokens.text }]}>{l.registrations.toLocaleString('en-IN')}</Text>
            <Text style={[styles.countLabel, { color: tokens.textMuted }]}>registered</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80, gap: spacing[3] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: borderRadius.xl },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.lg },
  title: { fontSize: typography.fontSize.base, ...font('medium') },
  muted: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  count: { alignItems: 'flex-end' },
  countNum: { fontSize: typography.fontSize.xl, ...font('heading') },
  countLabel: { fontSize: typography.fontSize.xs, ...font() },
});
