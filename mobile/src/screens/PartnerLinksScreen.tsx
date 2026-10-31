import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getMyPartnerLinks, type MyPartnerLink } from '../lib/api/tracking';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const THUMB_W = 88;
const THUMB_H = 66; // 4:3

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every event this user is a partner on, with the registrations each link brought in. */
export default function PartnerLinksScreen() {
  const router = useRouter();
  const c = useCosmos();
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
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {error ? <Text style={[styles.muted, { color: c.danger }]}>{error}</Text> : null}
      {!error && links.length === 0 ? (
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            No partner links yet
          </Text>
          <Text style={[styles.emptyText, { color: c.muted }]}>
            When an event curator adds you as a partner, its registrations show up here.
          </Text>
        </View>
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
            <Text style={[styles.countNum, { color: c.sky }]}>{l.registrations.toLocaleString('en-IN')}</Text>
            <Text style={[styles.countLabel, { color: c.muted }]}>registered</Text>
          </View>
        </Pressable>
      ))}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[3], paddingRight: spacing[4], borderRadius: cosmosCardRadius },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md },
  title: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  emptyTitle: { fontSize: typography.fontSize.xl, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  emptyText: { marginTop: spacing[2], textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  count: { alignItems: 'flex-end' },
  countNum: { fontSize: typography.fontSize.xl, lineHeight: 26, ...cosmosFont.figure },
  countLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
