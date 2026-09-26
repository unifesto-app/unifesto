import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CalendarBlank, CaretRight, Gavel, Handshake, QrCode } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';
import { Badge } from '../ui';
import Skeleton from '../Skeleton';
import { GUTTER } from './Section';
import { relativeWhen } from '../../utils/eventFormat';
import type { HostedEvent } from '../../hooks/useWorkspaceCards';
import type { CheckinEvent } from '../../lib/api/checkin';
import type { JudgingEvent } from '../../lib/api/leaderboard';
import type { PortalSponsor } from '../../lib/api/sponsorPortal';

interface SpacePanelProps {
  liveCheckins: CheckinEvent[];
  upcoming: HostedEvent[];
  loadingUpcoming: boolean;
  /** True when the user hosts at least one space (shows the empty state). */
  hosting: boolean;
  judging: JudgingEvent[];
  sponsorships: PortalSponsor[];
  onScan: (e: CheckinEvent) => void;
  onOpenEvent: (e: HostedEvent) => void;
  onCreateEvent: () => void;
  onOpenJudging: (e: JudgingEvent) => void;
  onOpenSponsor: (s: PortalSponsor) => void;
}

const plural = (n: number, one: string) => `${n.toLocaleString('en-IN')} ${one}${n === 1 ? '' : 's'}`;

/**
 * Operator snapshot on Home: a live check-in to jump into, my next hosted
 * events with how full they are, plus judging boards and sponsor leads.
 */
export default function SpacePanel(p: SpacePanelProps) {
  const tokens = useTokens();
  const glyph = { size: 24, color: tokens.accent, weight: 'fill' as const };

  return (
    <View style={styles.wrap}>
      {p.liveCheckins.map((e) => (
        <Pressable
          key={e.id}
          onPress={() => p.onScan(e)}
          accessibilityRole="button"
          accessibilityLabel={`Scan tickets for ${e.title}`}
          style={({ pressed }) => [styles.card, styles.row, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <CardBackdrop shape={styles.card} />
          <QrCode {...glyph} />
          <View style={{ flex: 1 }}>
            <View style={styles.liveRow}>
              <View style={[styles.dot, { backgroundColor: tokens.success }]} />
              <Text style={[styles.eyebrow, { color: tokens.success }]}>Check-in live</Text>
            </View>
            <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>{e.title}</Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
              {plural(e._count.registrations, 'registration')}
            </Text>
          </View>
          <View style={[styles.cta, { backgroundColor: tokens.accent }]}>
            <Text style={[styles.ctaText, { color: tokens.accentFg }]}>Scan</Text>
          </View>
        </Pressable>
      ))}

      {p.loadingUpcoming && p.upcoming.length === 0 ? (
        <View style={[styles.card, styles.list]}>
          <CardBackdrop shape={styles.card} />
          {[0, 1].map((i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={64} height={48} borderRadius={borderRadius.md} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="45%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : p.upcoming.length > 0 ? (
        <View style={[styles.card, styles.list]}>
          <CardBackdrop shape={styles.card} />
          {p.upcoming.map((e) => (
            <EventRow key={e.id} event={e} onPress={() => p.onOpenEvent(e)} />
          ))}
        </View>
      ) : p.hosting ? (
        <Pressable
          onPress={p.onCreateEvent}
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, styles.row, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <CardBackdrop shape={styles.card} />
          <CalendarBlank {...glyph} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: tokens.text }]}>No upcoming events</Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]}>Plan the next one from my space.</Text>
          </View>
          <CaretRight size={16} color={tokens.textMuted} weight="bold" />
        </Pressable>
      ) : null}

      {p.judging.length > 0 || p.sponsorships.length > 0 ? (
        <View style={[styles.card, styles.list]}>
          <CardBackdrop shape={styles.card} />
          {p.judging.map((j) => (
            <LinkRow
              key={j.boardId}
              icon={<Gavel {...glyph} />}
              title={j.title}
              meta={`${j.kind === 'MENTOR' ? 'Mentor' : 'Judge'} · ${
                j.activeRounds > 0 ? `${plural(j.activeRounds, 'round')} open` : relativeWhen(j.startDateTime)
              }`}
              onPress={() => p.onOpenJudging(j)}
            />
          ))}
          {p.sponsorships.map((s) => (
            <LinkRow
              key={s.sponsorId}
              icon={<Handshake {...glyph} />}
              title={s.name}
              meta={s.leadCount ? `${plural(s.leadCount, 'lead')} captured` : `Sponsoring ${s.spaceName}`}
              onPress={() => p.onOpenSponsor(s)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EventRow({ event: e, onPress }: { event: HostedEvent; onPress: () => void }) {
  const tokens = useTokens();
  const going = e.attendees?.total ?? e._count?.registrations ?? 0;
  const fill = e.capacity ? Math.min(1, going / e.capacity) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${going} going`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {e.coverImageUrl ? (
        <Image source={{ uri: e.coverImageUrl }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, { backgroundColor: tokens.fill }]} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: tokens.text, flexShrink: 1 }]} numberOfLines={1}>{e.title}</Text>
          {e.status === 'DRAFT' ? <Badge label="Draft" tone="neutral" /> : null}
        </View>
        <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
          {relativeWhen(e.startDateTime)} · {e.spaceName}
        </Text>
        <View style={styles.fillRow}>
          {fill !== null ? (
            <View style={[styles.track, { backgroundColor: tokens.fill }]}>
              <View style={[styles.bar, { width: `${fill * 100}%`, backgroundColor: fill >= 1 ? tokens.warning : tokens.accent }]} />
            </View>
          ) : null}
          <Text style={[styles.count, { color: tokens.textSecondary }]}>
            {e.capacity ? `${going.toLocaleString('en-IN')}/${e.capacity.toLocaleString('en-IN')}` : `${going.toLocaleString('en-IN')} going`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function LinkRow({ icon, title, meta, onPress }: { icon: React.ReactNode; title: string; meta: string; onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.icon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>{meta}</Text>
      </View>
      <CaretRight size={16} color={tokens.textMuted} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER, gap: spacing[3] },
  card: { borderRadius: borderRadius.xl, padding: spacing[4] },
  list: { gap: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  icon: { width: 64, alignItems: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: typography.fontSize.xs, ...font('semibold') },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title: { fontSize: typography.fontSize.base, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, ...font() },
  thumb: { width: 64, height: 48, borderRadius: borderRadius.md },
  fillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 4 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  count: { fontSize: typography.fontSize.xs, ...font('medium') },
  cta: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  ctaText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
