import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../src/components/ui/RefreshControl';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { VideoCamera } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../src/components/ui/CardSurface';
import CosmosBackdrop from '../src/components/ui/CosmosBackdrop';
import { GUTTER } from '../src/components/home/Section';
import useTopSpacing from '../src/hooks/useTopSpacing';
import Skeleton from '../src/components/Skeleton';
import { getMySessions, listSessions, PLATFORM_LABELS, type Session } from '../src/lib/api/sessions';
import { useAuth } from '../src/context/AuthContext';
import { formatTime } from '../src/utils/eventFormat';
import { borderRadius, spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../src/theme/cosmos';

// Session covers follow the event banner ratio: 4:3.
const THUMB_W = 104;
const THUMB_H = 78;

const platformOf = (s: Session) =>
  s.platform === 'OTHER' ? s.platformOther || 'Online' : PLATFORM_LABELS[s.platform];

const isLive = (s: Session, now: number) => {
  const start = new Date(s.startDateTime).getTime();
  return now >= start && now < start + (s.durationMinutes || 60) * 60000;
};

/** "Today", "Tomorrow", else "Sat, 12 Oct". */
function dayLabel(d: Date, now = new Date()) {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Online sessions from spaces: grouped by day, live ones flagged, filterable by platform. */
export default function SessionsListScreen() {
  const c = useCosmos();
  const router = useRouter();
  const topSpacing = useTopSpacing();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const { user } = useAuth();
  // Sessions I've booked (B18): before this they were listed nowhere.
  const [mine, setMine] = useState<Session[]>([]);

  const load = useCallback(async () => {
    const [all, regs] = await Promise.all([listSessions(), user ? getMySessions() : Promise.resolve([])]);
    setSessions(all);
    const now = Date.now();
    setMine(
      regs
        .filter((r) => r.paymentStatus !== 'PENDING' && r.paymentStatus !== 'FAILED')
        .map((r) => r.session)
        .filter((s) => s.status !== 'CANCELLED' && new Date(s.startDateTime).getTime() + (s.durationMinutes || 60) * 60000 > now),
    );
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const platforms = useMemo(() => Array.from(new Set(sessions.map(platformOf))), [sessions]);

  // Soonest first (live ones naturally lead), bucketed by calendar day.
  const groups = useMemo(() => {
    const list = sessions
      .filter((s) => !platform || platformOf(s) === platform)
      .sort((a, b) => +new Date(a.startDateTime) - +new Date(b.startDateTime));
    const out: { label: string; data: Session[] }[] = [];
    for (const s of list) {
      const label = dayLabel(new Date(s.startDateTime));
      const last = out[out.length - 1];
      if (last && last.label === label) last.data.push(s);
      else out.push({ label, data: [s] });
    }
    return out;
  }, [sessions, platform]);

  const open = useCallback((s: Session) => router.push(`/session/${s.slug}`), [router]);

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <Stack.Screen options={{ title: 'Unifesto Huddle', headerShown: true }} />
      <SectionList
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
        sections={loading ? [] : groups}
        keyExtractor={(s) => s.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <>
            <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">Live and upcoming</Text>
            <Text style={[styles.lead, { color: c.soft }]}>Online talks and workshops from spaces on Unifesto.</Text>

            {mine.length > 0 ? (
              <View style={{ marginTop: spacing[8] }}>
                <Text style={[styles.groupLabel, { color: c.muted }]}>My sessions</Text>
                <View style={{ gap: spacing[4] }}>
                  {mine.map((s) => (
                    <SessionRow key={s.id} s={s} live={isLive(s, now)} withDay onOpen={open} />
                  ))}
                </View>
              </View>
            ) : null}

            {platforms.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
                {[null, ...platforms].map((p) => {
                  const active = platform === p;
                  return (
                    <Pressable
                      key={p ?? 'all'}
                      onPress={() => setPlatform(p)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? c.primary : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                    >
                      {!active ? <CardBackdrop shape={styles.chip} /> : null}
                      <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{p ?? 'All'}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ marginTop: spacing[6], gap: spacing[4] }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.row}>
                  <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.md} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="85%" height={14} borderRadius={6} />
                    <Skeleton width="55%" height={12} borderRadius={6} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.empty, { backgroundColor: c.raised }]}>
              <VideoCamera size={40} color={c.muted} weight="duotone" />
              <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">No sessions coming up</Text>
              <Text style={[styles.emptyBody, { color: c.muted }]}>
                When spaces schedule online talks or workshops, they show up here.
              </Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.groupLabel, { color: c.muted, marginTop: spacing[8] }]}>{section.label}</Text>
        )}
        ItemSeparatorComponent={ItemGap}
        renderItem={({ item }) => <SessionRow s={item} live={isLive(item, now)} onOpen={open} />}
      />
    </View>
  );
}

const ItemGap = () => <View style={{ height: spacing[4] }} />;

/** One session: 4:3 thumb, live marker, title, time, platform, host and price. */
const SessionRow = React.memo(function SessionRow({ s, live, withDay, onOpen }: { s: Session; live: boolean; withDay?: boolean; onOpen: (s: Session) => void }) {
  const c = useCosmos();
  const price = Number(s.price);
  const start = new Date(s.startDateTime);
  return (
    <Pressable
      onPress={() => onOpen(s)}
      accessibilityRole="button"
      accessibilityLabel={s.title}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: c.raised }]}>
        {s.coverImageUrl ? (
          <Image source={{ uri: s.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
            <VideoCamera size={26} color={c.muted} weight="fill" />
          </LinearGradient>
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        {live ? <LiveChip color={c.mint} /> : null}
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={2}>{s.title}</Text>
        <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>
          {withDay ? `${dayLabel(start)}, ` : ''}{formatTime(start)} · {s.durationMinutes || 60} min · {platformOf(s)}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
          {[s.space?.name, price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free'].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
});

/** Pulsing "Live now" marker: a 6pt mint dot and plain text, never a pill. */
function LiveChip({ color }: { color: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.4 }] }));
  return (
    <View style={styles.live}>
      <View style={styles.liveDotWrap}>
        <Animated.View style={[styles.liveRing, { backgroundColor: color }, ring]} />
        <View style={[styles.liveDot, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.liveText, { color }]}>Live now</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.fontSize['3xl'], lineHeight: 34, ...cosmosFont.display, letterSpacing: displayTracking(28) },
  lead: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  chipsWrap: { marginTop: spacing[5], marginHorizontal: -GUTTER },
  chips: { paddingHorizontal: GUTTER, gap: spacing[2] },
  chip: { height: 36, paddingHorizontal: spacing[4], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  groupLabel: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], ...cosmosFont.strong },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  rowTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  empty: { alignItems: 'center', marginTop: spacing[6], padding: spacing[6], borderRadius: cosmosCardRadius },
  emptyTitle: { marginTop: spacing[4], fontSize: 20, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  emptyBody: { marginTop: 6, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', maxWidth: 300, ...cosmosFont.body },
});
