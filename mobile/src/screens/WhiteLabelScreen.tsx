import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams } from 'expo-router';
import { CaretDown, CaretRight } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getWhiteLabel, latestRequestFor, type WhiteLabelOverview } from '../lib/api/whiteLabel';
import BrandColorCard from '../components/manage/BrandColorCard';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * White-label for a space: its accent colour (inherited by every event), then
 * per-event overrides. Colour-only; the first change of each is reviewed by
 * Unifesto, later changes apply straight away.
 */
export default function WhiteLabelScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<WhiteLabelOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useAnalyticsScreenTracking('WhiteLabel');

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

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const spaceColor = data.space.whiteLabelEnabled && data.planHasBranding ? data.space.brandColor : null;
  const spaceLatest = latestRequestFor(data, null);
  const spaceState = data.space.whiteLabelEnabled ? 'On' : spaceLatest?.status === 'PENDING' ? 'Pending review' : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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
        <View style={styles.head}>
          <Text style={[styles.heading, { color: tokens.text }]}>Space colour</Text>
          {spaceState ? (
            <Text style={[styles.state, { color: spaceState === 'On' ? tokens.success : tokens.warning }]}>{spaceState}</Text>
          ) : null}
        </View>
        <Text style={[styles.intro, { color: tokens.textSecondary }]}>
          Replaces Unifesto blue on your space page, every event under it, and in the app.
        </Text>
        <BrandColorCard
          spaceId={spaceId!}
          enabled={data.space.whiteLabelEnabled}
          brandColor={data.space.brandColor}
          latest={spaceLatest}
          planHasBranding={data.planHasBranding}
          surfaces={data.space}
          onChanged={load}
        />

        <Text style={[styles.heading, { color: tokens.text, marginTop: spacing[10] }]}>Event colours</Text>
        <Text style={[styles.intro, { color: tokens.textSecondary }]}>
          Events use the space colour. Give one its own only when it needs a different look.
        </Text>

        {data.events.length === 0 ? (
          <Text style={[styles.muted, { color: tokens.textMuted, marginTop: spacing[4], textAlign: 'left' }]}>No events yet.</Text>
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
                <View key={e.id} style={styles.item}>
                  <CardBackdrop shape={styles.item} />
                  <Pressable onPress={() => setOpen(isOpen ? null : e.id)} style={styles.itemHead} accessibilityRole="button">
                    {swatch ? <View style={[styles.dot, { backgroundColor: swatch }]} /> : null}
                    <Text style={[styles.itemTitle, { color: tokens.text }]} numberOfLines={1}>
                      {e.title}
                    </Text>
                    {tag ? <Text style={[styles.tag, { color: tokens.textMuted }]}>{tag}</Text> : null}
                    {isOpen ? <CaretDown size={15} color={tokens.textMuted} /> : <CaretRight size={15} color={tokens.textMuted} />}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  heading: { fontSize: typography.fontSize.lg, marginLeft: spacing[1], ...font('heading') },
  state: { fontSize: typography.fontSize.sm, ...font('semibold') },
  intro: { marginTop: spacing[1], marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  list: { marginTop: spacing[4], gap: spacing[3] },
  item: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  itemTitle: { flex: 1, fontSize: typography.fontSize.base, ...font('medium') },
  tag: { fontSize: typography.fontSize.xs, ...font('medium') },
  itemBody: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
});
