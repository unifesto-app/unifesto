import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../../../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTokens } from '../../../context/ThemeContext';
import useTopSpacing from '../../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../../hooks/useAnalyticsScreenTracking';
import {
  getReconBalance,
  getReconPayments,
  getReconRefunds,
  getReconSettlements,
  getReconSummary,
  type ReconBalance,
  type ReconPaymentRow,
  type ReconPayments,
  type ReconRefunds,
  type ReconSettlements,
  type ReconSummary,
  type Result,
} from '../../../lib/api/apexMoney';
import SegmentedTabs from '../../../components/ui/SegmentedTabs';
import ChipPicker from '../../../components/manage/ChipPicker';
import ManageStats from '../../../components/manage/ManageStats';
import { SwitchRow } from '../../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../../components/profile/SettingsGroup';
import { ApexRow, longDate, shortDate } from '../../../components/apex/ApexRow';
import { AppAlert } from '../../../components/ui/AppAlert';
import type { Tokens } from '../../../theme/tokens';
import { rangeFor, WINDOWS, type WindowDays } from './reconWindow';
import { inr, inrShort } from '../../../utils/money';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { font } from '../../../theme/fontHelpers';

const GUTTER = spacing[6];

type Tab = 'overview' | 'payments' | 'settlements' | 'refunds';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'payments', label: 'Payments' },
  { key: 'settlements', label: 'Bank' },
  { key: 'refunds', label: 'Refunds' },
];

type Data = {
  overview?: { summary: ReconSummary; balance: Result<ReconBalance> };
  payments?: ReconPayments;
  settlements?: ReconSettlements;
  refunds?: ReconRefunds;
};

function paymentBadge(r: ReconPaymentRow, tokens: Tokens) {
  switch (r.status) {
    case 'MATCHED':
      return r.amountMismatch ? { text: 'Amount differs', color: tokens.danger } : { text: 'Matched', color: tokens.success };
    case 'MISSING_IN_PLATFORM':
      return { text: 'Not in platform', color: tokens.danger };
    case 'MISSING_IN_RAZORPAY':
      return { text: 'Not in Razorpay', color: tokens.warning };
    default:
      return { text: 'Uncaptured', color: tokens.textMuted };
  }
}

/**
 * Platform ledger against Razorpay, fetched live: the balance still held at
 * Razorpay, captured vs recorded for the window, and line-by-line payments,
 * bank settlements and refunds. A payment Razorpay has but we don't opens its
 * transaction with the payment id ready to reconcile.
 */
export default function ReconciliationScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState<WindowDays>('30');
  const [data, setData] = useState<Data>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const generation = useRef(0);

  useAnalyticsScreenTracking('ApexReconciliation');

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const r = rangeFor(days);
    let res: Result<unknown>;
    let patch: Data = {};
    if (tab === 'overview') {
      // Balance is an all-time sweep: slower, and its failure shouldn't hide the summary.
      const [summary, balance] = await Promise.all([getReconSummary(r), getReconBalance()]);
      res = summary;
      if (summary.ok) patch = { overview: { summary: summary.data, balance } };
    } else if (tab === 'payments') {
      const p = await getReconPayments(r);
      res = p;
      if (p.ok) patch = { payments: p.data };
    } else if (tab === 'settlements') {
      const s = await getReconSettlements(r);
      res = s;
      if (s.ok) patch = { settlements: s.data };
    } else {
      const f = await getReconRefunds(r);
      res = f;
      if (f.ok) patch = { refunds: f.data };
    }
    if (gen !== generation.current) return;
    if (res.ok) {
      setData((d) => ({ ...d, ...patch }));
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, [tab, days]);

  // A new window invalidates every tab's data.
  useEffect(() => {
    setData({});
  }, [days]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const copy = (label: string, value: string) => async () => {
    await Clipboard.setStringAsync(value);
    AppAlert.alert('Copied', `${label} copied.`);
  };

  const body = () => {
    if (error) return <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text>;

    if (tab === 'overview' && data.overview) {
      const { summary: s, balance } = data.overview;
      const capturedOff = Math.abs(s.diff.captured) > 1;
      const refundOff = Math.abs(s.diff.refunded) > 1;
      return (
        <>
          <SettingsGroup title="Held at Razorpay" plain>
            {balance.ok ? (
              <>
                <SettingsRow label={balance.data.approximate ? 'Balance (at least)' : 'Balance'} value={inr(balance.data.balance)} />
                <SettingsRow label="As of" value={longDate(balance.data.asOf)} />
              </>
            ) : (
              <SettingsRow label="Couldn't read the balance" value={balance.message} />
            )}
          </SettingsGroup>
          <Text style={[styles.note, { color: tokens.textMuted }]}>All time: captured − fees − refunds − settled to bank.</Text>

          <View style={styles.tiles}>
            <ManageStats stats={[{ label: 'Razorpay captured', value: inrShort(s.razorpay.captured) }, { label: 'We recorded', value: inrShort(s.platform.captured) }]} />
            <ManageStats stats={[{ label: capturedOff ? 'Out of sync by' : 'In sync', value: inrShort(s.diff.captured) }, { label: 'Settled to bank', value: inrShort(s.razorpay.settledToBank) }]} />
          </View>

          <SettingsGroup title="Razorpay" plain>
            <SettingsRow label={`Captured (${s.razorpay.capturedCount})`} value={inr(s.razorpay.captured)} />
            <SettingsRow label="Refunded" value={`− ${inr(s.razorpay.refunded)}`} />
            <SettingsRow label="Fees + GST" value={`− ${inr(s.razorpay.fees)}`} />
            <SettingsRow label="Net, should settle" value={inr(s.razorpay.net)} />
            <SettingsRow label={`Settled to bank (${s.razorpay.settlementCount})`} value={inr(s.razorpay.settledToBank)} />
          </SettingsGroup>
          <SettingsGroup title="Unifesto ledger" plain>
            <SettingsRow label={`Captured (${s.platform.paidCount} paid)`} value={inr(s.platform.captured)} />
            <SettingsRow label="Refunded (matched)" value={`− ${inr(s.platform.refunded)}`} />
            <SettingsRow label="Processing fees" value={inr(s.platform.processingFees)} />
            <SettingsRow label="Captured difference" value={inr(s.diff.captured)} trailing={capturedOff ? <Dot color={tokens.danger} /> : undefined} />
            <SettingsRow label="Unrecorded refunds" value={inr(s.diff.refunded)} trailing={refundOff ? <Dot color={tokens.danger} /> : undefined} />
          </SettingsGroup>
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            {`${shortDate(s.window.from)} to ${shortDate(s.window.to)}. A positive difference means Razorpay has money we haven't recorded; the Payments tab shows which.`}
          </Text>
        </>
      );
    }

    if (tab === 'payments' && data.payments) {
      const p = data.payments;
      const rows = onlyIssues ? p.rows.filter((r) => (r.status !== 'MATCHED' || r.amountMismatch) && r.status !== 'RAZORPAY_UNCAPTURED') : p.rows;
      return (
        <>
          <View style={styles.tiles}>
            <ManageStats stats={[{ label: 'Matched', value: p.counts.matched }, { label: 'Not in platform', value: p.counts.missingInPlatform }]} />
            <ManageStats stats={[{ label: 'Not in Razorpay', value: p.counts.missingInRazorpay }, { label: 'Amount differs', value: p.counts.amountMismatch }]} />
          </View>
          <SettingsGroup plain>
            <SwitchRow label="Only mismatches" value={onlyIssues} onValueChange={setOnlyIssues} />
          </SettingsGroup>
          {rows.length === 0 ? <Text style={[styles.empty, { color: tokens.textMuted }]}>{onlyIssues ? 'No mismatches in this window.' : 'No payments in this window.'}</Text> : null}
          {rows.map((r) => {
            const b = paymentBadge(r, tokens);
            const regId = r.reconcileRegistrationId;
            const missing = r.status === 'MISSING_IN_PLATFORM';
            return (
              <View key={r.paymentId}>
                <ApexRow
                  title={r.platform?.title ?? r.contact ?? r.paymentId}
                  meta={[b.text, r.method, shortDate(r.createdAt), r.platform && r.razorpayAmount !== r.platform.amount ? `we have ${inr(r.platform.amount)}` : null]
                    .filter(Boolean)
                    .join('  ·  ')}
                  value={r.razorpayAmount == null ? (r.platform ? inr(r.platform.amount) : '—') : inr(r.razorpayAmount)}
                  valueColor={b.color}
                  onPress={
                    regId
                      ? () => router.push(`/apex/money/transactions/${regId}${missing ? `?pay=${encodeURIComponent(r.paymentId)}` : ''}` as never)
                      : copy('Payment id', r.paymentId)
                  }
                />
                <View style={[styles.sep, { backgroundColor: tokens.border }]} />
              </View>
            );
          })}
        </>
      );
    }

    if (tab === 'settlements' && data.settlements) {
      const s = data.settlements;
      return (
        <>
          <View style={styles.tiles}>
            <ManageStats stats={[{ label: 'Settled to bank', value: inrShort(s.totalSettled) }, { label: 'Settlements', value: s.count }]} />
          </View>
          {s.rows.length === 0 ? (
            <Text style={[styles.empty, { color: tokens.textMuted }]}>No settlements in this window. Razorpay settles on its own cycle, usually T+2.</Text>
          ) : null}
          {s.rows.map((r) => (
            <View key={r.id}>
              <ApexRow
                title={inr(r.amount)}
                meta={[shortDate(r.settledAt), r.utr ? `UTR ${r.utr}` : null, `fees ${inr(r.fees + r.tax)}`].filter(Boolean).join('  ·  ')}
                value={r.status ?? '—'}
                valueColor={r.status === 'processed' ? tokens.success : tokens.textMuted}
                onPress={r.utr ? copy('UTR', r.utr) : undefined}
              />
              <View style={[styles.sep, { backgroundColor: tokens.border }]} />
            </View>
          ))}
        </>
      );
    }

    if (tab === 'refunds' && data.refunds) {
      const f = data.refunds;
      return (
        <>
          <View style={styles.tiles}>
            <ManageStats stats={[{ label: 'Razorpay refunds', value: f.counts.total }, { label: 'Matched', value: f.counts.matched }, { label: 'Not in platform', value: f.counts.missingInPlatform }]} />
          </View>
          {f.rows.length === 0 ? <Text style={[styles.empty, { color: tokens.textMuted }]}>No refunds in this window.</Text> : null}
          {f.rows.map((r) => {
            const matched = r.status === 'MATCHED';
            return (
              <View key={r.refundId}>
                <ApexRow
                  title={r.platform?.title ?? r.paymentId ?? r.refundId}
                  meta={[matched ? 'Matched' : 'Not in platform', shortDate(r.createdAt), r.razorpayStatus].filter(Boolean).join('  ·  ')}
                  value={inr(r.razorpayAmount)}
                  valueColor={matched ? tokens.text : tokens.danger}
                  onPress={r.platform ? () => router.push(`/manage/refund/${r.platform!.refundRequestId}`) : copy('Refund id', r.refundId)}
                />
                <View style={[styles.sep, { backgroundColor: tokens.border }]} />
              </View>
            );
          })}
        </>
      );
    }

    return loading ? <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} /> : null;
  };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />}
    >
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      <View style={{ marginTop: spacing[4] }}>
        <ChipPicker options={WINDOWS} value={days} onChange={(v) => v && setDays(v)} />
      </View>
      {body()}
    </ScrollView>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  tiles: { marginTop: spacing[5], gap: spacing[3] },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  empty: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  sep: { height: StyleSheet.hairlineWidth },
});
