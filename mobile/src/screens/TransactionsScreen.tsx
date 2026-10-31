import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Check, Export } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../components/ui/CardSurface';
import {
  downloadTransactionsExport,
  getTransactions,
  getTransactionSummary,
  type ExportFormat,
  type TransactionRow,
  type TransactionSummary,
} from '../lib/api/transactions';
import { getUsage } from '../lib/api/billing';
import ManageStats from '../components/manage/ManageStats';
import ChipPicker from '../components/manage/ChipPicker';
import SearchField from '../components/manage/SearchField';
import CosmosScreen, { CosmosList } from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { inr, inrShort } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { type Cosmos, cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

type StatusFilter = 'all' | 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
const STATUS: { value: Exclude<StatusFilter, 'all'>; label: string }[] = [
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const statusColor = (s: string, c: Cosmos) =>
  s === 'PAID' ? c.success : s === 'FAILED' ? c.danger : s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED' ? c.warn : c.muted;

const statusLabel = (s: string) => (s === 'PARTIALLY_REFUNDED' ? 'Part refunded' : s.charAt(0) + s.slice(1).toLowerCase());

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Money in and out for one event: collected, net, pending and refunded, then
 * every paid registration with search and filters. Tapping a row opens the
 * attendee. Export shares the server's own transactions file.
 */
export default function TransactionsScreen() {
  const { eventId, slug, spaceId } = useLocalSearchParams<{ eventId: string; slug?: string; spaceId?: string }>();
  const router = useRouter();
  const c = useCosmos();

  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [ticket, setTicket] = useState('');
  const [canExport, setCanExport] = useState<boolean | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getTransactions(eventId);
    if (res.ok) {
      setRows(res.data);
      setError('');
    } else {
      setError(res.denied ? 'Transactions are only open to Space admins.' : res.message);
      setRows((r) => r ?? []);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Export is a plan perk; ask the same flag the server enforces.
  useEffect(() => {
    if (!spaceId) return;
    void getUsage(spaceId).then((u) => setCanExport(u.ok ? u.data.features.hasBulkExport : null));
  }, [spaceId]);

  const tickets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows ?? []) if (r.ticketType) seen.set(r.ticketType.id, r.ticketType.name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [rows]);

  // Tiles follow the ticket filter only; the list follows every filter.
  const byTicket = useMemo(() => (rows ?? []).filter((r) => !ticket || r.ticketTypeId === ticket), [rows, ticket]);
  // Tiles come from the server's settle(), so Net carries each sale's
  // organiser fee exactly as payouts do (T6).
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const loadSummary = useCallback(async () => {
    if (!eventId) return;
    const res = await getTransactionSummary(eventId, ticket || undefined);
    if (res.ok) setSummary(res.data);
  }, [eventId, ticket]);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return byTicket.filter((r) => {
      if (status !== 'all' && r.paymentStatus !== status) return false;
      if (!q) return true;
      return [r.user.fullName, r.user.username, r.user.email].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [byTicket, status, query]);

  const runExport = async (format: ExportFormat) => {
    setExporting(true);
    const res = await downloadTransactionsExport(eventId!, slug ?? '', format);
    setExporting(false);
    if (!res.ok) {
      AppAlert.alert("Couldn't export", res.message);
      return;
    }
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
  };

  const exportMenu = () => {
    if (canExport === false) {
      AppAlert.alert('Exports need a higher plan', "This space's plan doesn't include exports. See Plan and billing.");
      return;
    }
    AppAlert.alert('Export transactions', 'Collected, fee, refunded and net for every paid registration.', [
      { text: 'Spreadsheet', onPress: () => void runExport('xlsx') },
      { text: 'CSV', onPress: () => void runExport('csv') },
      { text: 'PDF', onPress: () => void runExport('pdf') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!rows) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const header = (
    <View>
      <ManageStats
        stats={[
          { label: 'Collected', value: summary ? inrShort(summary.collected) : '…', tone: 'ivory' },
          { label: 'Net', value: summary ? inrShort(summary.net) : '…', tone: 'ivory' },
          { label: 'Refunded', value: summary ? inrShort(summary.refunded) : '…' },
        ]}
      />
      <Text style={[styles.meta, { color: c.muted }]}>
        {summary
          ? `${summary.paidCount.toLocaleString('en-IN')} paid · ${inr(summary.buyerFees)} buyer fees · ${inr(summary.platformFee)} platform fee` +
            (summary.pending > 0 ? ` · ${inr(summary.pending)} awaiting payment` : '')
          : ' '}
      </Text>

      <View style={{ marginTop: spacing[6] }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Name or email" />
      </View>

      <View style={{ marginTop: spacing[4] }}>
        <ChipPicker options={STATUS} value={status === 'all' ? '' : status} onChange={(v) => setStatus(v || 'all')} clearable />
      </View>
      {tickets.length > 1 ? (
        <View style={{ marginTop: spacing[2] }}>
          <ChipPicker options={tickets} value={ticket} onChange={setTicket} clearable />
        </View>
      ) : null}
      {error ? <Text style={[styles.meta, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );

  return (
    <CosmosList
      data={list}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ marginBottom: spacing[5] }}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([load(), loadSummary()]);
        setRefreshing(false);
      }}
      ListEmptyComponent={
        error ? null : (
          <View style={styles.emptyCard}>
            <CardBackdrop shape={styles.emptyCard} />
            <Text style={[styles.empty, { color: c.soft }]}>
              {rows.length === 0 ? 'Paid registrations show up here once tickets sell.' : 'Nothing matches these filters.'}
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        rows.length > 0 ? (
          <Button
            label="Export"
            variant="secondary"
            fullWidth
            loading={exporting}
            icon={<Export size={18} color={c.text} weight="bold" />}
            onPress={exportMenu}
            style={{ marginTop: spacing[8] }}
          />
        ) : null
      }
      // One card for the list: each payment is a segment of it.
      renderItem={({ item: r, index }) => (
        <View style={cardSegment(c.raised, index, list.length)}>
          {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
          <Pressable
            onPress={() => router.push(`/manage/event/${eventId}/attendee/${r.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${r.user.fullName || r.user.username || 'Unknown'}, ${inr(Number(r.totalAmount) || 0)}, ${statusLabel(r.paymentStatus)}`}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {r.user.fullName || r.user.username || 'Unknown'}
              </Text>
              <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>
                {[when(r.paidAt || r.registeredAt), r.ticketType?.name].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.amount, { color: c.text }]}>{inr(Number(r.totalAmount) || 0)}</Text>
              <View style={styles.statusRow}>
                {r.paymentStatus === 'PAID' ? <Check size={11} color={c.success} weight="bold" /> : null}
                <Text style={[styles.status, { color: statusColor(r.paymentStatus, c) }]}>{statusLabel(r.paymentStatus)}</Text>
              </View>
            </View>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  meta: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  sep: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4] },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sub: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  amount: { fontSize: typography.fontSize.base, ...cosmosFont.figure },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  status: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  emptyCard: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  empty: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
