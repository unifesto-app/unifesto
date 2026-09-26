import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../../../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { useTokens } from '../../../context/ThemeContext';
import useTopSpacing from '../../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../../hooks/useAnalyticsScreenTracking';
import { getOrphanedPayments, reconcileTransaction, type OrphanedPaymentRow, type OrphanedPayments } from '../../../lib/api/apexMoney';
import ChipPicker from '../../../components/manage/ChipPicker';
import ManageStats from '../../../components/manage/ManageStats';
import { longDate } from '../../../components/apex/ApexRow';
import { CardBackdrop } from '../../../components/ui/CardSurface';
import { Button } from '../../../components/ui';
import { AppAlert } from '../../../components/ui/AppAlert';
import { rangeFor, WINDOWS, type WindowDays } from './reconWindow';
import { inr } from '../../../utils/money';
import { borderRadius, spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { font } from '../../../theme/fontHelpers';

const GUTTER = spacing[6];

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
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [days, setDays] = useState<WindowDays>('30');
  const [data, setData] = useState<OrphanedPayments | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const generation = useRef(0);

  useAnalyticsScreenTracking('ApexOrphanedPayments');

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

  const confirmAnyway = (row: OrphanedPaymentRow) =>
    AppAlert.alert(`Attach anyway at ${inr(row.amount)}?`, "The ticket's recorded amount is rewritten to what was actually captured.", [
      { text: 'Back', style: 'cancel' },
      { text: 'Attach anyway', style: 'destructive', onPress: () => void attach(row, true) },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />}
    >
      <ChipPicker options={WINDOWS} value={days} onChange={(v) => v && setDays(v)} />

      {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}
      {loading && !data ? <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} /> : null}

      {data ? (
        <>
          <View style={styles.tiles}>
            <ManageStats stats={[{ label: 'Need attention', value: data.counts.total }, { label: 'Orphaned', value: data.counts.orphaned }]} />
            <ManageStats stats={[{ label: 'Unsettled', value: data.counts.unsettled }, { label: 'No target found', value: data.counts.unresolved }]} />
          </View>
          {data.rows.length === 0 ? (
            <Text style={[styles.empty, { color: tokens.textMuted }]}>Every captured payment in this window is a paid ticket.</Text>
          ) : null}
          {data.rows.map((row) => {
            const st = rows[row.paymentId] ?? {};
            const orphan = row.classification === 'ORPHANED';
            const hasTarget = !!row.targetRegistrationId;
            const openTxn = (id: string) => router.push(`/apex/money/transactions/${id}?pay=${encodeURIComponent(row.paymentId)}` as never);
            return (
              <View key={row.paymentId} style={styles.card}>
                <CardBackdrop shape={styles.card} />
                <View style={styles.head}>
                  <Text style={[styles.amount, { color: tokens.text }]}>{inr(row.amount)}</Text>
                  <Text style={[styles.kind, { color: orphan ? tokens.danger : tokens.warning }]}>{orphan ? 'Orphaned' : 'Unsettled'}</Text>
                </View>
                <Text style={[styles.meta, { color: tokens.textMuted }]} selectable>
                  {[row.paymentId, row.method, row.contact || row.email, longDate(row.createdAt)].filter(Boolean).join('  ·  ')}
                </Text>

                <Text style={[styles.why, { color: tokens.textSecondary }]}>
                  {orphan
                    ? row.suggestion
                      ? `Its registration is gone. Attaching moves it onto ${row.suggestion.attendee}'s pending ticket for ${row.suggestion.eventTitle} and marks it paid.`
                      : 'Its registration is gone and no matching pending ticket was found. Enter the registration it belongs to.'
                    : 'Captured, but the ticket stayed pending (missed webhook). Attaching settles that registration in place.'}
                </Text>
                {hasTarget ? (
                  <Text style={[styles.link, { color: tokens.accent }]} onPress={() => openTxn(row.targetRegistrationId!)}>
                    Open the registration
                  </Text>
                ) : (
                  <TextInput
                    value={st.manualTarget ?? ''}
                    onChangeText={(v) => patchRow(row.paymentId, { manualTarget: v, err: undefined, mismatch: false })}
                    placeholder="Target registration id"
                    placeholderTextColor={tokens.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { color: tokens.text, backgroundColor: tokens.pressed }]}
                  />
                )}

                {st.err ? <Text style={[styles.msg, { color: tokens.danger }]}>{st.err}</Text> : null}
                {st.ok ? <Text style={[styles.msg, { color: tokens.success }]}>{st.ok}</Text> : null}

                {!st.ok ? (
                  <Button
                    label={hasTarget ? 'Attach and mark paid' : 'Attach to this id'}
                    size="md"
                    fullWidth
                    loading={st.busy && !st.mismatch}
                    disabled={st.busy}
                    onPress={() => void attach(row)}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  tiles: { marginTop: spacing[5], marginBottom: spacing[2], gap: spacing[3] },
  note: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...font('medium') },
  empty: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  card: { marginTop: spacing[3], padding: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  amount: { fontSize: typography.fontSize.xl, ...font('heading') },
  kind: { fontSize: typography.fontSize.sm, ...font('semibold') },
  meta: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  why: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  link: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  input: { marginTop: spacing[3], height: 44, paddingHorizontal: spacing[3], borderRadius: borderRadius.lg, fontSize: typography.fontSize.sm, ...font() },
  msg: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...font('medium') },
});
