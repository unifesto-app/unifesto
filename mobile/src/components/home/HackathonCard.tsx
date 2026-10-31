import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { CaretRight, Trophy } from '@unifesto/unicon/react-native';
import { getMyHackathon, type HackathonHub } from '../../lib/api/hackathon';
import type { UpcomingTicket } from '../../hooks/useHomeData';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { CardBackdrop } from '../ui/CardSurface';
import PressableScale from '../ui/PressableScale';

type Team = NonNullable<HackathonHub['team']>;

/** motion-design token: ease-out-quart for enters. */
const EASE_OUT = Easing.bezier(0.165, 0.84, 0.44, 1);

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

/** Elapsed share of the hackathon, filling in on mount. */
function TimeBar({ progress, color, track }: { progress: number; color: string; track: string }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? progress : 0);
  React.useEffect(() => {
    fill.value = withTiming(progress, { duration: reduced ? 0 : 700, easing: EASE_OUT });
  }, [progress, reduced, fill]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, transformOrigin: 'left' }, fillStyle]} />
    </View>
  );
}

interface HackathonCardProps {
  hub: HackathonHub;
  onPress: () => void;
}

/**
 * My hackathon on Home, on a plain card (Up next holds the screen's shade):
 * a live countdown, the elapsed-time bar in mint while it runs, and what the
 * team should do next.
 */
export default function HackathonCard({ hub, onPress }: HackathonCardProps) {
  const c = useCosmos();
  const team = hub.team!;

  const now = useNow();
  const start = new Date(hub.event.startDateTime).getTime();
  const end = new Date(hub.event.endDateTime).getTime();
  const live = start <= now && now < end;
  const progress = live ? (now - start) / (end - start) : 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(260).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })}
      style={{ paddingHorizontal: GUTTER }}
    >
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Hackathon ${hub.event.title}, team ${team.name}. ${statusLine(team, hub.unreadCount)}`}
        style={styles.card}
      >
        <CardBackdrop shape={styles.card} />
        <View style={styles.topRow}>
          <Trophy size={26} color={c.text} weight="fill" />
          <View style={{ flex: 1 }}>
            <View style={styles.liveRow}>
              {live ? <LiveDot color={c.mint} /> : null}
              <Text style={[styles.liveText, { color: live ? c.mint : c.muted }]} numberOfLines={1}>
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
        {live ? <TimeBar progress={progress} color={c.mint} track={c.tint} /> : null}
        <View style={styles.bottomRow}>
          <Text style={[styles.status, { color: c.soft }]} numberOfLines={1}>{statusLine(team, hub.unreadCount)}</Text>
          <CaretRight size={14} color={c.muted} weight="bold" />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing[4], borderRadius: cosmosCardRadius },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { flexShrink: 1, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  dotWrap: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  team: { fontSize: typography.fontSize.lg, marginTop: 2, ...cosmosFont.strong },
  clockCol: { alignItems: 'flex-end' },
  clock: { fontSize: typography.fontSize.base, lineHeight: 24, ...cosmosFont.figure },
  clockLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  track: { height: 3, borderRadius: 2, marginTop: spacing[3], overflow: 'hidden' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  status: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
