import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CaretDown, CaretRight } from '@unifesto/unicon/react-native';
import { getWhiteLabel, latestRequestFor, type WhiteLabelOverview } from '../lib/api/whiteLabel';
import BrandColorCard from '../components/manage/BrandColorCard';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * White-label for a space: its accent colour (inherited by every event), then
 * per-event overrides. Self-serve when the plan includes it; the full theme
 * (logo, font, page theme) lives in the space app's Branding studio.
 */
export default function WhiteLabelScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const c = useCosmos();
  const [data, setData] = useState<WhiteLabelOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) return;
    const res = await getWhiteLabel(spaceId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.denied ? 'Branding is managed by Space admins.' : res.message);
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
              <Text style={[styles.muted, { color: c.soft, textAlign: 'center' }]}>{error}</Text>
              <AuthButton label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : (
            <>
              <Skeleton width="100%" height={200} borderRadius={cosmosCardRadius} />
              <Skeleton width="100%" height={120} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
            </>
          )}
        </View>
      </CosmosScreen>
    );
  }

  const spaceColor = data.space.whiteLabelEnabled && data.planHasBranding ? data.space.brandColor : null;
  const spaceLatest = latestRequestFor(data, null);
  const spaceState = data.space.whiteLabelEnabled ? 'On' : spaceLatest?.status === 'PENDING' ? 'Pending review' : null;

  return (
    <CosmosScreen keyboard keyboardDismissMode="interactive" refreshing={refreshing} onRefresh={onRefresh}>
      <Section title="Space colour" subtitle="Replaces Unifesto blue on your space page, every event under it, and in the app" style={styles.firstSection}>
        <View style={styles.pad}>
          {spaceState ? (
            <View style={[styles.pill, { backgroundColor: c.tint }]}>
              <View style={[styles.pillDot, { backgroundColor: spaceState === 'On' ? c.success : c.warn }]} />
              <Text style={[styles.pillText, { color: c.text }]}>{spaceState}</Text>
            </View>
          ) : null}
          <BrandColorCard
            spaceId={spaceId!}
            enabled={data.space.whiteLabelEnabled}
            brandColor={data.space.brandColor}
            latest={spaceLatest}
            planHasBranding={data.planHasBranding}
            surfaces={data.space}
            onChanged={load}
          />
        </View>
      </Section>

      <Section title="Event colours" subtitle="Events use the space colour. Give one its own only when it needs a different look">
        <View style={styles.pad}>
          {data.events.length === 0 ? (
            <View style={[styles.card, { backgroundColor: c.raised }]}>
              <Text style={[styles.muted, { color: c.soft }]}>No events yet.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {data.events.map((e) => {
                const latest = latestRequestFor(data, e.id);
                const isOpen = open === e.id;
                const swatch = e.whiteLabelEnabled ? e.brandColor : spaceColor;
                const tag = e.whiteLabelEnabled
                  ? 'Own colour'
                  : latest?.status === 'PENDING'
                    ? 'Pending review'
                    : spaceColor
                      ? 'Space colour'
                      : '';
                return (
                  <View key={e.id} style={[styles.item, { backgroundColor: c.raised }]}>
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : e.id)}
                      style={({ pressed }) => [styles.itemHead, { opacity: pressed ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      accessibilityLabel={[e.title, tag].filter(Boolean).join(', ')}
                    >
                      {swatch ? <View style={[styles.dot, { backgroundColor: swatch }]} /> : null}
                      <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      {tag ? <Text style={[styles.tag, { color: c.muted }]}>{tag}</Text> : null}
                      {isOpen ? <CaretDown size={15} color={c.muted} /> : <CaretRight size={15} color={c.muted} />}
                    </Pressable>
                    {isOpen ? (
                      <View style={styles.itemBody}>
                        <BrandColorCard
                          spaceId={spaceId!}
                          eventId={e.id}
                          enabled={e.whiteLabelEnabled}
                          brandColor={e.brandColor}
                          latest={latest}
                          planHasBranding={data.planHasBranding}
                          inherited={spaceColor}
                          onChanged={load}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  muted: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  firstSection: { marginTop: spacing[4] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, ...cosmosFont.strong },
  list: { gap: spacing[3] },
  item: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  itemTitle: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  tag: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  itemBody: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
});
