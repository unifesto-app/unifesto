import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Export, MagnifyingGlass, X } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
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
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { inr, inrShort } from '../utils/money';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { type Cosmos, cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];

type StatusFilter = 'all' | 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
const STATUS: { value: Exclude<StatusFilter, 'all'>; label: string }[] = [
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const statusColor = (s: string, c: Cosmos) =>
  s === 'PAID' ? c.success : s === 'FAILED' || s === 'REFUNDED' ? c.danger : s === 'PARTIALLY_REFUNDED' ? c.warn : c.muted;

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
  const topSpacing = useTopSpacing();

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
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const header = (
    <View>
      <ManageStats
        stats={[
          { label: 'Collected', value: summary ? inrShort(summary.collected) : '…' },
          { label: 'Net', value: summary ? inrShort(summary.net) : '…' },
          { label: 'Refunded', value: summary ? inrShort(summary.refunded) : '…' },
        ]}
      />
      <Text style={[styles.meta, { color: c.muted }]}>
        {summary
          ? `${summary.paidCount.toLocaleString('en-IN')} paid · ${inr(summary.buyerFees)} buyer fees · ${inr(summary.platformFee)} platform fee` +
            (summary.pending > 0 ? ` · ${inr(summary.pending)} awaiting payment` : '')
          : ' '}
      </Text>

      <View style={[styles.search, { marginTop: spacing[6] }]}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={c.muted} weight="bold" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name or email"
          placeholderTextColor={c.muted}
          selectionColor={c.primary}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.searchInput, { color: c.text }]}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <X size={18} color={c.muted} weight="bold" />
          </Pressable>
        ) : null}
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
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
        ListHeaderComponentStyle={{ marginBottom: spacing[5] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), loadSummary()]);
              setRefreshing(false);
            }}
            tintColor={c.primary}
            colors={[c.primary]}
            progressViewOffset={topSpacing}
          />
        }
        ListEmptyComponent={
          error ? null : (
            <Text style={[styles.empty, { color: c.muted }]}>
              {rows.length === 0 ? 'Paid registrations show up here once tickets sell.' : 'Nothing matches these filters.'}
            </Text>
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
        renderItem={({ item: r }) => (
          <Pressable
            onPress={() => router.push(`/manage/event/${eventId}/attendee/${r.id}`)}
            style={({ pressed }) => [styles.row, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <CardBackdrop shape={styles.row} />
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
              <Text style={[styles.status, { color: statusColor(r.paymentStatus, c) }]}>{statusLabel(r.paymentStatus)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sub: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  amount: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  status: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  empty: { textAlign: 'center', paddingVertical: spacing[10], fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
