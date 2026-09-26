import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../../../components/ui/RefreshControl';
import { useFocusEffect } from 'expo-router';
import { CaretDown, CaretRight } from 'phosphor-react-native';
import { useTokens } from '../../../context/ThemeContext';
import useTopSpacing from '../../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../../hooks/useAnalyticsScreenTracking';
import {
  getPlatformFinancials,
  getPlatformFinancialsBreakdown,
  type FinancialsFigures,
  type PlatformFinancials,
  type SpaceFinancials,
} from '../../../lib/api/apexMoney';
import ManageStats from '../../../components/manage/ManageStats';
import ChipPicker from '../../../components/manage/ChipPicker';
import { BlockTitle } from '../../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../../components/profile/SettingsGroup';
import { shortDate } from '../../../components/apex/ApexRow';
import { CardBackdrop } from '../../../components/ui/CardSurface';
import { inr, inrShort } from '../../../utils/money';
import { borderRadius, spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { font } from '../../../theme/fontHelpers';

const GUTTER = spacing[6];

type SortKey = keyof Pick<FinancialsFigures, 'available' | 'collectedOverall' | 'netEntitlement' | 'pending' | 'refunded'>;

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'available', label: 'Still owed' },
  { value: 'collectedOverall', label: 'Collected' },
  { value: 'netEntitlement', label: 'Net owed' },
  { value: 'pending', label: 'Queued' },
  { value: 'refunded', label: 'Refunded' },
];

/** Same order as the web table's columns. */
const FIGURES: { key: keyof FinancialsFigures; label: string }[] = [
  { key: 'collectedOverall', label: 'Collected' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'platformFee', label: 'Platform fee' },
  { key: 'netEntitlement', label: 'Net owed' },
  { key: 'settled', label: 'Settled' },
  { key: 'pending', label: 'Queued' },
  { key: 'available', label: 'Still owed' },
];

/**
 * Platform money, cash-accurate: what came in, what went back, what organisers
 * are owed and how much of that has been paid. Spaces expand to their events.
 */
export default function FinancialsScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [totals, setTotals] = useState<PlatformFinancials | null>(null);
  const [spaces, setSpaces] = useState<SpaceFinancials[] | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('available');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('ApexFinancials');

  const load = useCallback(async () => {
    // Prefer the breakdown; the flat totals keep the tiles alive if it fails.
    const b = await getPlatformFinancialsBreakdown();
    if (b.ok) {
      setTotals(b.data.totals);
      setSpaces(b.data.spaces);
      setError('');
      return;
    }
    const t = await getPlatformFinancials();
    if (t.ok) {
      setTotals(t.data);
      setError(b.message);
    } else setError(t.denied ? 'Only Unifesto platform admins can see this.' : t.message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sorted = useMemo(() => (spaces ? [...spaces].sort((a, b) => b[sort] - a[sort]) : []), [spaces, sort]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!totals) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />}
    >
      <Text style={[styles.hero, { color: tokens.text }]}>{inr(totals.platformEarnings)}</Text>
      <Text style={[styles.muted, { color: tokens.textMuted }]}>Platform earnings · app fees + revenue share</Text>
      {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}

      <View style={styles.tiles}>
        <ManageStats stats={[{ label: 'Collected', value: inrShort(totals.collectedOverall) }, { label: 'Ticket revenue', value: inrShort(totals.ticketRevenue) }]} />
        <ManageStats stats={[{ label: 'Processing fees', value: inrShort(totals.processingFees) }, { label: 'Refunded', value: inrShort(totals.refunded) }]} />
      </View>

      <SettingsGroup title="Owed to organisers" plain>
        <SettingsRow label="Platform fee (rev-share)" value={`− ${inr(totals.platformFee)}`} />
        <SettingsRow label="Net owed" value={inr(totals.netEntitlement)} />
        <SettingsRow label="Settled" value={inr(totals.settled)} />
        <SettingsRow label="Queued for transfer" value={inr(totals.pending)} />
        <SettingsRow label="Still owed" value={inr(totals.available)} />
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>Net owed = settled + queued + still owed. Figures are cumulative and survive refunds.</Text>

      {spaces ? (
        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>By space</BlockTitle>
          <ChipPicker options={SORTS} value={sort} onChange={(v) => v && setSort(v)} />
          {sorted.length === 0 ? <Text style={[styles.note, { color: tokens.textMuted }]}>No space has collected money yet.</Text> : null}
          {sorted.map((s) => (
            <SpaceCard key={s.spaceId} space={s} sortKey={sort} open={open.has(s.spaceId)} onToggle={() => toggle(s.spaceId)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SpaceCard({ space, sortKey, open, onToggle }: { space: SpaceFinancials; sortKey: SortKey; open: boolean; onToggle: () => void }) {
  const tokens = useTokens();
  const fee = space.feePercent > 0 ? `${space.feePercent}% rev-share` : 'No rev-share';
  const Caret = open ? CaretDown : CaretRight;
  return (
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.cardHead, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
            {space.name}
          </Text>
          <Text style={[styles.muted, { color: tokens.textMuted }]} numberOfLines={1}>
            {`${space.eventCount} ${space.eventCount === 1 ? 'event' : 'events'}  ·  ${fee}`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.cardValue, { color: sortKey === 'available' && space.available > 0 ? tokens.warning : tokens.text }]}>{inr(space[sortKey])}</Text>
          <Text style={[styles.tiny, { color: tokens.textMuted }]}>{SORTS.find((s) => s.value === sortKey)?.label}</Text>
        </View>
        <Caret size={15} color={tokens.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Figures f={space} />
          <Text style={[styles.sub, { color: tokens.textMuted }]}>{`Platform earned ${inr(space.platformEarnings)}`}</Text>
          {space.events.length === 0 ? <Text style={[styles.sub, { color: tokens.textMuted }]}>No events yet.</Text> : null}
          {space.events.map((e) => (
            <View key={e.eventId} style={[styles.event, { borderTopColor: tokens.border }]}>
              <Text style={[styles.eventTitle, { color: tokens.text }]} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={[styles.tiny, { color: tokens.textMuted }]}>{shortDate(e.startDateTime)}</Text>
              <Figures f={e} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Two-column grid of the seven figures; zeros are muted, money still owed is tinted. */
function Figures({ f }: { f: FinancialsFigures }) {
  const tokens = useTokens();
  return (
    <View style={styles.grid}>
      {FIGURES.map(({ key, label }) => {
        const v = f[key];
        const color = v === 0 ? tokens.textMuted : key === 'available' ? tokens.warning : tokens.text;
        return (
          <View key={key} style={styles.cell}>
            <Text style={[styles.tiny, { color: tokens.textMuted }]}>{label}</Text>
            <Text style={[styles.cellValue, { color }]}>{inr(v)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  hero: { fontSize: typography.fontSize['4xl'], ...font('heading') },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  tiles: { marginTop: spacing[5], gap: spacing[3] },
  card: { marginTop: spacing[3], borderRadius: borderRadius.xl, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4] },
  cardTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  cardValue: { fontSize: typography.fontSize.base, ...font('semibold') },
  body: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
  sub: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...font() },
  event: { marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: StyleSheet.hairlineWidth },
  eventTitle: { fontSize: typography.fontSize.sm, ...font('semibold') },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] },
  cell: { width: '50%', paddingVertical: spacing[1] },
  cellValue: { fontSize: typography.fontSize.sm, ...font('medium') },
  tiny: { fontSize: typography.fontSize.xs, ...font() },
});
