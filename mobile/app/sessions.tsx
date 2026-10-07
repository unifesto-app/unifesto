import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../src/components/ui/RefreshControl';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { VideoCamera } from 'phosphor-react-native';
import { useTokens } from '../src/context/ThemeContext';
import { CardBackdrop } from '../src/components/ui/CardSurface';
import useTopSpacing from '../src/hooks/useTopSpacing';
import Skeleton from '../src/components/Skeleton';
import { listSessions, PLATFORM_LABELS, type Session } from '../src/lib/api/sessions';
import { formatTime } from '../src/utils/eventFormat';
import { borderRadius, spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { font } from '../src/theme/fontHelpers';

const GUTTER = spacing[6];
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
  const tokens = useTokens();
  const router = useRouter();
  const topSpacing = useTopSpacing(8);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSessions(await listSessions());
    setLoading(false);
    setRefreshing(false);
  }, []);

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
    const out: { label: string; items: Session[] }[] = [];
    for (const s of list) {
      const label = dayLabel(new Date(s.startDateTime));
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [sessions, platform]);

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <Stack.Screen options={{ title: 'Unifesto Huddle', headerShown: true }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: spacing[12] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      >
        <Text style={[styles.title, { color: tokens.text }]}>Live and upcoming</Text>
        <Text style={[styles.lead, { color: tokens.textSecondary }]}>Online talks and workshops from spaces on Unifesto.</Text>

        {platforms.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
            {[null, ...platforms].map((p) => {
              const active = platform === p;
              return (
                <Pressable
                  key={p ?? 'all'}
                  onPress={() => setPlatform(p)}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                >
                  {!active ? <CardBackdrop shape={styles.chip} /> : null}
                  <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{p ?? 'All'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {loading ? (
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
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <VideoCamera size={48} color={tokens.textSecondary} weight="duotone" />
            <Text style={[styles.emptyTitle, { color: tokens.text }]}>No sessions coming up</Text>
            <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>
              When spaces schedule online talks or workshops, they show up here.
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.label} style={{ marginTop: spacing[8] }}>
              <Text style={[styles.groupLabel, { color: tokens.textMuted }]}>{g.label}</Text>
              <View style={{ gap: spacing[4] }}>
                {g.items.map((s) => {
                  const live = isLive(s, now);
                  const price = Number(s.price);
                  const start = new Date(s.startDateTime);
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => router.push(`/session/${s.slug}`)}
                      accessibilityRole="button"
                      accessibilityLabel={s.title}
                      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <View style={[styles.thumb, { backgroundColor: tokens.elevated }]}>
                        {s.coverImageUrl ? (
                          <Image source={{ uri: s.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        ) : (
                          <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
                            <VideoCamera size={26} color="#ffffff" weight="fill" />
                          </LinearGradient>
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        {live ? <LiveChip color={tokens.danger} /> : null}
                        <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={2}>{s.title}</Text>
                        <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
                          {formatTime(start)} · {s.durationMinutes || 60} min · {platformOf(s)}
                        </Text>
                        <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
                          {[s.space?.name, price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free'].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** Pulsing "Live now" marker. */
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
  title: { fontSize: typography.fontSize['2xl'], letterSpacing: -0.4, ...font('heading') },
  lead: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  chipsWrap: { marginTop: spacing[5], marginHorizontal: -GUTTER },
  chips: { paddingHorizontal: GUTTER, gap: spacing[2] },
  chip: { height: 36, paddingHorizontal: spacing[4], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...font('medium') },
  groupLabel: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], ...font('semibold') },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  rowTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, ...font() },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 12, ...font('semibold') },
  empty: { alignItems: 'center', paddingTop: spacing[16], paddingHorizontal: spacing[4] },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, ...font('heading') },
  emptyBody: { marginTop: 6, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', maxWidth: 300, ...font() },
});
