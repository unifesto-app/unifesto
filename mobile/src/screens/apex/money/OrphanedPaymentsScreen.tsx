import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import CosmosScreen from '../../../components/ui/CosmosScreen';
import { GUTTER } from '../../../components/home/Section';
import { useRouter } from 'expo-router';
import { getOrphanedPayments, reconcileTransaction, type OrphanedPaymentRow, type OrphanedPayments } from '../../../lib/api/apexMoney';
import ChipPicker from '../../../components/manage/ChipPicker';
import ManageStats from '../../../components/manage/ManageStats';
import { longDate } from '../../../components/apex/ApexRow';
import { Button } from '../../../components/ui';
import { AppAlert } from '../../../components/ui/AppAlert';
import { rangeFor, WINDOWS, type WindowDays } from './reconWindow';
import { inr } from '../../../utils/money';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../../theme/cosmos';

type RowState = {
  busy?: boolean;
  ok?: string;
  err?: string;
  manualTarget?: string;
  /** Last attempt was refused for a price difference: offer the explicit override. */
  mismatch?: boolean;
};

/**
 * Captured Razorpay payments that never became a paid ticket: ORPHANED (their
 * registration was deleted) or UNSETTLED (webhook missed, ticket still pending).
 * Each can be attached to the right registration here.
 */
export default function OrphanedPaymentsScreen() {
  const router = useRouter();
  const c = useCosmos();
  const [days, setDays] = useState<WindowDays>('30');
  const [data, setData] = useState<OrphanedPayments | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const generation = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const res = await getOrphanedPayments(rangeFor(days));
    if (gen !== generation.current) return;
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, [days]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    setRows({});
    await load();
    setRefreshing(false);
  };

  const patchRow = (id: string, p: RowState) => setRows((s) => ({ ...s, [id]: { ...s[id], ...p } }));

  const attach = async (row: OrphanedPaymentRow, allowAmountMismatch = false) => {
    const target = row.targetRegistrationId ?? rows[row.paymentId]?.manualTarget?.trim();
    if (!target) return patchRow(row.paymentId, { err: 'Enter the registration id to attach this payment to.' });
    patchRow(row.paymentId, { busy: true, ok: undefined, err: undefined });
    const res = await reconcileTransaction(target, { paymentId: row.paymentId, reassignOrphan: row.reassignOrphan, allowAmountMismatch });
    if (!res.ok) {
      // A price difference is recoverable, but only by a deliberate override.
      const mismatch = /does not match this registration/i.test(res.message);
      return patchRow(row.paymentId, { busy: false, err: res.message, mismatch });
    }
    patchRow(row.paymentId, { busy: false, mismatch: false, ok: res.data.detail || `Attached, now ${res.data.newStatus.toLowerCase()}.` });
    // Let the success line register, then drop the settled row.
    setTimeout(() => void load(), 1200);
  };

  const confirmAttach = (row: OrphanedPaymentRow) => {
    const target = row.targetRegistrationId ?? rows[row.paymentId]?.manualTarget?.trim();
    if (!target) return patchRow(row.paymentId, { err: 'Enter the registration id to attach this payment to.' });
    AppAlert.alert(`Attach ${inr(row.amount)} and mark paid?`, `Payment ${row.paymentId} settles registration ${target}. This can't be undone.`, [
      { text: 'Back', style: 'cancel' },
      { text: 'Attach', onPress: () => void attach(row) },
    ]);
  };

  const confirmAnyway = (row: OrphanedPaymentRow) =>
    AppAlert.alert(`Attach anyway at ${inr(row.amount)}?`, "The ticket's recorded amount is rewritten to what was actually captured.", [
      { text: 'Back', style: 'cancel' },
      { text: 'Attach anyway', style: 'destructive', onPress: () => void attach(row, true) },
    ]);

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh} contentContainerStyle={styles.content} keyboardDismissMode="on-drag">
      <ChipPicker options={WINDOWS} value={days} onChange={(v) => v && setDays(v)} />

      {error ? (
        <View style={[styles.emptyCard, { backgroundColor: c.raised }]}>
          <Text style={[styles.empty, { color: c.soft }]}>{error}</Text>
          <Button variant="secondary" label="Try again" onPress={() => void onRefresh()} style={{ marginTop: spacing[4] }} />
        </View>
      ) : null}
      {loading && !data ? <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} /> : null}

      {data ? (
        <>
          <View style={styles.tiles}>
            <ManageStats stats={[{ label: 'Need attention', value: data.counts.total }, { label: 'Orphaned', value: data.counts.orphaned }]} />
            <ManageStats stats={[{ label: 'Unsettled', value: data.counts.unsettled }, { label: 'No target found', value: data.counts.unresolved }]} />
          </View>
          {data.rows.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: c.raised }]}>
              <Text style={[styles.empty, { color: c.soft }]}>Every captured payment in this window is a paid ticket.</Text>
            </View>
          ) : null}
          {data.rows.map((row) => {
            const st = rows[row.paymentId] ?? {};
            const orphan = row.classification === 'ORPHANED';
            const hasTarget = !!row.targetRegistrationId;
            const openTxn = (id: string) => router.push(`/apex/money/transactions/${id}?pay=${encodeURIComponent(row.paymentId)}` as never);
            return (
              <View key={row.paymentId} style={[styles.card, { backgroundColor: c.raised }]}>
                <View style={styles.head}>
                  <Text style={[styles.amount, { color: c.text }]}>{inr(row.amount)}</Text>
                  <View style={[styles.chip, { backgroundColor: `${orphan ? c.danger : c.warn}26` }]}>
                    <Text style={[styles.kind, { color: orphan ? c.danger : c.warn }]}>{orphan ? 'Orphaned' : 'Unsettled'}</Text>
                  </View>
                </View>
                <Text style={[styles.meta, { color: c.muted }]} selectable>
                  {[row.paymentId, row.method, row.contact || row.email, longDate(row.createdAt)].filter(Boolean).join('  ·  ')}
                </Text>

                <Text style={[styles.why, { color: c.soft }]}>
                  {orphan
                    ? row.suggestion
                      ? `Its registration is gone. Attaching moves it onto ${row.suggestion.attendee}'s pending ticket for ${row.suggestion.eventTitle} and marks it paid.`
                      : 'Its registration is gone and no matching pending ticket was found. Enter the registration it belongs to.'
                    : 'Captured, but the ticket stayed pending (missed webhook). Attaching settles that registration in place.'}
                </Text>
                {hasTarget ? (
                  <Text style={[styles.link, { color: c.primary }]} onPress={() => openTxn(row.targetRegistrationId!)}>
                    Open the registration
                  </Text>
                ) : (
                  <TextInput
                    value={st.manualTarget ?? ''}
                    onChangeText={(v) => patchRow(row.paymentId, { manualTarget: v, err: undefined, mismatch: false })}
                    placeholder="Target registration id"
                    placeholderTextColor={c.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { color: c.text, backgroundColor: c.tint }]}
                  />
                )}

                {st.err ? <Text style={[styles.msg, { color: c.danger }]}>{st.err}</Text> : null}
                {st.ok ? <Text style={[styles.msg, { color: c.success }]}>{st.ok}</Text> : null}

                {!st.ok ? (
                  <Button
                    label={hasTarget ? 'Attach and mark paid' : 'Attach to this id'}
                    size="md"
                    fullWidth
                    loading={st.busy && !st.mismatch}
                    disabled={st.busy}
                    onPress={() => confirmAttach(row)}
                    style={{ marginTop: spacing[3] }}
                  />
                ) : null}
                {st.mismatch && !st.ok ? (
                  <Button
                    label={`Attach anyway at ${inr(row.amount)}`}
                    variant="danger"
                    size="md"
                    fullWidth
                    disabled={st.busy}
                    onPress={() => confirmAnyway(row)}
                    style={{ marginTop: spacing[2] }}
                  />
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  tiles: { marginTop: spacing[5], marginBottom: spacing[2], gap: spacing[3] },
  emptyCard: { marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  empty: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  card: { marginTop: spacing[3], padding: spacing[4], borderRadius: cosmosCardRadius, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: typography.fontSize.xl, ...cosmosFont.figure },
  chip: { paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: 999 },
  kind: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  meta: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  why: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  link: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  input: { marginTop: spacing[3], height: 44, paddingHorizontal: spacing[3], borderRadius: cosmosRadius, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  msg: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.strong },
});
