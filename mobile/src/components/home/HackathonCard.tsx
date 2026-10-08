import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CaretRight, Trophy } from '@unifesto/unicon/react-native';
import { getMyHackathon, type HackathonHub } from '../../lib/api/hackathon';
import type { UpcomingTicket } from '../../hooks/useHomeData';
import { useBannerAccent } from '../../hooks/useBannerPalette';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { CardBackdrop } from '../ui/CardSurface';

type Team = NonNullable<HackathonHub['team']>;

/** motion-design tokens: ease-out-quart for enters, sine in-out for ambient loops. */
const EASE_OUT = Easing.bezier(0.165, 0.84, 0.44, 1);
const EASE_IN_OUT = Easing.inOut(Easing.sin);

/**
 * The first of my upcoming tickets where I'm on a live hackathon team.
 * Home tickets spread `reg.event`, so `ticket.id` is the event id.
 * ponytail: one /hackathon/:id/me call per upcoming ticket (≤5); add a
 * `hackathon` flag to the registrations list if that grows.
 */
export function useMyHackathon(tickets: UpcomingTicket[]): HackathonHub | null {
  const [hub, setHub] = React.useState<HackathonHub | null>(null);
  const key = tickets.map((t) => t.id).join(',');
  React.useEffect(() => {
    let alive = true;
    Promise.all(tickets.map((t) => getMyHackathon(String(t.id)).catch(() => null))).then((results) => {
      if (!alive) return;
      const found = results.find((r) => r?.ok && r.data?.team && r.data.team.stage !== 'CANCELLED');
      setHub(found?.ok ? found.data : null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return hub;
}

/** The one thing the team should know right now, most urgent first. */
function statusLine(team: Team, unread: number): string {
  const req = team.evaluation?.request;
  if (req?.status === 'CALLED') return `You're up for ${req.roundName}`;
  if (req?.status === 'WAITING' && req.position) return `#${req.position} in the ${req.roundName} queue`;
  if (team.stage === 'NEEDS_PS' && !team.statementBlock) return 'Lock in a problem statement';
  if (team.stage === 'ELIMINATED') return 'Thanks for building with us';
  if (unread > 0) return `${unread} new update${unread === 1 ? '' : 's'}`;
  if (team.statement) return team.statement.title;
  return team.room ? `Room ${team.room.name}` : 'Open team hub';
}

/** Ticks once a second while mounted. */
function useNow() {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Under a day: 04:12:09. Longer: 2d 4h. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  return `${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** A 0 → 1 → 0 loop on the UI thread; stays still under Reduce Motion. */
function useLoop(duration: number, delay = 0) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) return;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: EASE_IN_OUT }), -1, true));
  }, [reduced, v, duration, delay]);
  return v;
}

/** Solid dot with a ring that radiates out and fades, like a broadcast light. */
function LiveDot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const ring = useSharedValue(0);
  React.useEffect(() => {
    if (!reduced) ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduced, ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - ring.value), transform: [{ scale: 1 + 1.6 * ring.value }] }));
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dot, { backgroundColor: color, position: 'absolute' }, ringStyle]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

/** Elapsed share of the hackathon, filling in on mount, with a light sweep across it. */
function TimeBar({ progress, color }: { progress: number; color: string }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? progress : 0);
  const sweep = useSharedValue(0);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    fill.value = withTiming(progress, { duration: reduced ? 0 : 700, easing: EASE_OUT });
  }, [progress, reduced, fill]);
  React.useEffect(() => {
    if (!reduced) sweep.value = withRepeat(withSequence(withTiming(1, { duration: 1600, easing: Easing.linear }), withDelay(900, withTiming(0, { duration: 0 }))), -1, false);
  }, [reduced, sweep]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + (w + 60) * sweep.value * fill.value }] }));
  return (
    <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, transformOrigin: 'left' }, fillStyle]} />
      <Animated.View style={[styles.sweep, sweepStyle]}>
        <LinearGradient colors={['transparent', 'rgba(255,255,255,0.7)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/** Trophy that gently bobs, so the card reads as "in play". */
function FloatingTrophy({ color }: { color: string }) {
  const t = useLoop(1800);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * t.value }, { rotate: `${-6 + 12 * t.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Trophy size={26} color={color} weight="fill" />
    </Animated.View>
  );
}

interface HackathonCardProps {
  hub: HackathonHub;
  onPress: () => void;
}

/**
 * Home hero for my hackathon, on the standard card surface (no banner): elements take the
 * event banner's colour, with a live countdown, elapsed-time bar and what the
 * team should do next.
 */
export default function HackathonCard({ hub, onPress }: HackathonCardProps) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const team = hub.team!;
  const cover = coverOr(defaults, hub.eventId, hub.event.coverImageUrl);
  // Same banner colour the space / event pages wash with, used only on elements.
  const accent = useBannerAccent(cover, { event: hub.eventId }) ?? c.primary;

  const now = useNow();
  const start = new Date(hub.event.startDateTime).getTime();
  const end = new Date(hub.event.endDateTime).getTime();
  const live = start <= now && now < end;
  const progress = live ? (now - start) / (end - start) : 0;

  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.duration(260).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })}
      style={{ paddingHorizontal: GUTTER }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => (press.value = withTiming(0.98, { duration: 120, easing: EASE_OUT }))}
        onPressOut={() => (press.value = withTiming(1, { duration: 180, easing: EASE_OUT }))}
        accessibilityRole="button"
        accessibilityLabel={`Hackathon ${hub.event.title}, team ${team.name}. ${statusLine(team, hub.unreadCount)}`}
      >
        <Animated.View style={[styles.card, pressStyle]}>
          <CardBackdrop shape={styles.card} />
          <View style={styles.topRow}>
            <FloatingTrophy color={accent} />
            <View style={{ flex: 1 }}>
              <View style={styles.pill}>
                {live ? <LiveDot color={accent} /> : null}
                <Text style={[styles.pillText, { color: live ? accent : c.muted }]} numberOfLines={1}>
                  {live ? 'Live' : 'Unifesto Sprint'} · {hub.event.title}
                </Text>
              </View>
              <Text style={[styles.team, { color: c.text }]} numberOfLines={1}>{team.name}</Text>
            </View>
            <View style={styles.clockCol}>
              <Text style={[styles.clock, { color: c.text }]}>{countdown((live ? end : start) - now)}</Text>
              <Text style={[styles.clockLabel, { color: c.muted }]}>{live ? 'left' : 'to kickoff'}</Text>
            </View>
          </View>
          {live ? <TimeBar progress={progress} color={accent} /> : null}
          <View style={styles.bottomRow}>
            <Text style={[styles.status, { color: c.soft }]} numberOfLines={1}>{statusLine(team, hub.unreadCount)}</Text>
            <CaretRight size={14} color={accent} weight="bold" />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing[4], borderRadius: cosmosCardRadius },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { flexShrink: 1, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  team: { fontSize: typography.fontSize.lg, marginTop: 2, ...cosmosFont.strong },
  clockCol: { alignItems: 'flex-end' },
  clock: { fontSize: typography.fontSize.base, lineHeight: 24, fontVariant: ['tabular-nums'], ...cosmosFont.display },
  clockLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  track: { height: 3, borderRadius: 2, marginTop: spacing[3], overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.25)' },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: 60 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  status: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
