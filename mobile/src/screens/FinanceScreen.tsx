import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowCounterClockwise, Bank, Warning } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  getMyBankAccounts,
  getRefundQueue,
  getSpaceFinancials,
  getSpacePayouts,
  type BankAccount,
  type Financials,
  type Payout,
} from '../lib/api/finance';
import { PayoutRow } from '../components/manage/FinanceRows';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { inr } from '../utils/money';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { CardBackdrop } from '../components/ui/CardSurface';

const GUTTER = spacing[6];
const ICON = 28;

interface State {
  fin: Financials;
  payouts: Payout[];
  toReview: number;
  accounts: BankAccount[] | null;
}

/**
 * A space's money at a glance (Space Admins only): what's available to pay
 * out, how that number is reached, recent payouts, and refunds waiting on you.
 */
export default function FinanceScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  useAnalyticsScreenTracking('Finance');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const gen = ++generation.current;
    const [fin, payouts, queue, accounts] = await Promise.all([
      getSpaceFinancials(spaceId),
      getSpacePayouts(spaceId),
      getRefundQueue(spaceId, { status: 'PENDING_CURATOR', limit: 1 }),
      getMyBankAccounts(),
    ]);
    if (gen !== generation.current) return;
    if (!fin.ok) {
      setError(fin.denied ? 'Only Space admins can see this space’s money.' : fin.message);
      return;
    }
    setError('');
    setState({
      fin: fin.data,
      payouts: payouts.ok ? payouts.data : [],
      toReview: queue.ok ? queue.data.pagination?.total ?? 0 : 0,
      accounts: accounts.ok ? accounts.data : null,
    });
  }, [spaceId]);

  // Fresh numbers every time the screen comes back (after a payout request or a refund review).
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

  if (!state) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const { fin, payouts, toReview, accounts } = state;
  const hasVerified = accounts?.some((a) => a.status === 'VERIFIED') ?? true;
  const icon = (I: typeof Bank) => <I size={ICON} color={tokens.accent} weight="fill" />;

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
      }
    >
      {/* What can move now */}
      <View style={[styles.hero]}>
        <CardBackdrop shape={styles.hero} />
        <Text style={[styles.heroLabel, { color: tokens.textMuted }]}>Available to pay out</Text>
        <Text style={[styles.heroValue, { color: tokens.text }]}>{inr(fin.available)}</Text>
        <Text style={[styles.heroSub, { color: tokens.textSecondary }]}>
          {inr(fin.settled)} paid out{fin.pending > 0 ? `  ·  ${inr(fin.pending)} on the way` : ''}
        </Text>
        <Button
          label={fin.available > 0 ? 'Request payout' : 'Nothing to pay out yet'}
          size="lg"
          fullWidth
          disabled={fin.available <= 0}
          onPress={() => router.push(`/manage/space/${spaceId}/payouts`)}
          style={{ marginTop: spacing[5] }}
        />
      </View>

      {!hasVerified ? (
        <View style={[styles.warn]}>
          <CardBackdrop shape={styles.warn} />
          <Warning size={22} color={tokens.warning} weight="fill" />
          <Text style={[styles.warnText, { color: tokens.textSecondary }]}>
            No verified payout account yet. Add one in Unifesto Space on the web; Unifesto verifies it before money can be sent.
          </Text>
        </View>
      ) : null}

      <SettingsGroup title="Needs you">
        <SettingsRow
          icon={icon(ArrowCounterClockwise)}
          label="Refund requests"
          value={toReview > 0 ? `${toReview} to review` : 'All clear'}
          onPress={() => router.push(`/manage/space/${spaceId}/refunds`)}
        />
      </SettingsGroup>

      {/* How the number is reached — reconciles top to bottom */}
      <SettingsGroup title="How it adds up" plain>
        <SettingsRow label="Collected" value={inr(fin.collectedOverall)} />
        <SettingsRow label="App fees" value={`− ${inr(fin.processingFees)}`} />
        <SettingsRow label="Ticket revenue" value={inr(fin.ticketRevenue)} />
        <SettingsRow label="Refunded" value={fin.refunded ? `− ${inr(fin.refunded)}` : inr(0)} />
        <SettingsRow label="Platform fee" value={`− ${inr(fin.platformFee)}`} />
        <SettingsRow label="My earnings" value={inr(fin.netEntitlement)} />
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        My earnings = paid out + on the way + available. App fees are charged to buyers and kept by Unifesto.
      </Text>

      <SettingsGroup
        plain
        title="Recent payouts"
        action={payouts.length > 0 ? { label: 'See all', onPress: () => router.push(`/manage/space/${spaceId}/payouts`) } : undefined}
      >
        {payouts.length === 0 ? (
          <SettingsRow label="No payouts yet" />
        ) : (
          payouts.slice(0, 4).map((p) => <PayoutRow key={p.id} payout={p} inCard />)
        )}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon={icon(Bank)}
          label="My payout accounts"
          value={accounts ? String(accounts.length) : undefined}
          onPress={() => router.push(`/manage/space/${spaceId}/accounts`)}
        />
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, ...font() },
  hero: { borderRadius: borderRadius.xl, padding: spacing[5] },
  heroLabel: { fontSize: typography.fontSize.sm, ...font('medium') },
  heroValue: { marginTop: spacing[1], fontSize: typography.fontSize['4xl'], letterSpacing: -0.8, ...font('heading') },
  heroSub: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  warn: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start', marginTop: spacing[4], padding: spacing[4], borderRadius: borderRadius.xl },
  warnText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
