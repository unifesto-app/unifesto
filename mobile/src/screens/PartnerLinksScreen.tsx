import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import useTopSpacing from '../hooks/useTopSpacing';
import { getMyPartnerLinks, type MyPartnerLink } from '../lib/api/tracking';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];
const THUMB_W = 88;
const THUMB_H = 66; // 4:3

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every event this user is a partner on, with the registrations each link brought in. */
export default function PartnerLinksScreen() {
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [links, setLinks] = useState<MyPartnerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
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
          tintColor={c.primary}
        />
      }
    >
      {error ? <Text style={[styles.muted, { color: c.danger }]}>{error}</Text> : null}
      {!error && links.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>
          When an event curator adds you as a partner, its registrations show up here.
        </Text>
      ) : null}

      {links.map((l) => (
        <Pressable
          key={l.id}
          onPress={() => router.push(`/partner/${l.id}`)}
          style={({ pressed }) => [styles.row, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`${l.event.title}, ${l.registrations} registrations`}
        >
          <CardBackdrop shape={styles.row} />
          {l.event.coverImageUrl ? (
            <Image source={{ uri: l.event.coverImageUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: c.tint }]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{l.event.title}</Text>
            <Text style={[styles.muted, { color: c.muted }]} numberOfLines={1}>
              {when(l.event.startDateTime)} · as {l.name}
            </Text>
          </View>
          <View style={styles.count}>
            <Text style={[styles.countNum, { color: c.text }]}>{l.registrations.toLocaleString('en-IN')}</Text>
            <Text style={[styles.countLabel, { color: c.muted }]}>registered</Text>
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
  title: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  muted: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  count: { alignItems: 'flex-end' },
  countNum: { fontSize: typography.fontSize.xl, ...cosmosFont.display },
  countLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
