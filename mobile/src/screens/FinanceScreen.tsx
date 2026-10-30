import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowCounterClockwise, Bank, Warning } from '@unifesto/unicon/react-native';
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
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { inr } from '../utils/money';
import { openSpaceWeb } from '../lib/openOnWeb';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

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
  const c = useCosmos();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

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
      <CosmosScreen>
        <View style={styles.pad}>
          {error ? (
            <View style={[styles.card, { backgroundColor: c.raised }]}>
              <Text style={[styles.body, { color: c.soft, textAlign: 'center' }]}>{error}</Text>
              <AuthButton label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : (
            <>
              <Skeleton width="100%" height={210} borderRadius={cosmosCardRadius} />
              <Skeleton width="100%" height={56} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
              <Skeleton width="100%" height={280} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
            </>
          )}
        </View>
      </CosmosScreen>
    );
  }

  const { fin, payouts, toReview, accounts } = state;
  const hasVerified = accounts?.some((a) => a.status === 'VERIFIED') ?? true;
  const icon = (I: typeof Bank) => <I size={ICON} color={c.text} />;

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      {/* What can move now */}
      <View style={styles.pad}>
        <View style={[styles.card, { backgroundColor: c.raised }]}>
          <Text style={[styles.eyebrow, { color: c.muted }]}>Available to pay out</Text>
          <Text style={[styles.heroValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {inr(fin.available)}
          </Text>
          <Text style={[styles.body, { color: c.soft }]}>
            {inr(fin.settled)} paid out{fin.pending > 0 ? `  ·  ${inr(fin.pending)} on the way` : ''}
          </Text>
          <AuthButton
            label={fin.available > 0 ? 'Request payout' : 'Nothing to pay out yet'}
            arrow={fin.available > 0}
            disabled={fin.available <= 0}
            onPress={() => router.push(`/manage/space/${spaceId}/payouts`)}
            style={{ marginTop: spacing[5] }}
          />
        </View>

        {!hasVerified ? (
          <View style={[styles.warn, { backgroundColor: c.raised }]}>
            <Warning size={22} color={c.warn} weight="fill" />
            <Text style={[styles.warnText, { color: c.soft }]}>
              No verified payout account yet. Add one in Unifesto Space on the web; Unifesto verifies it before money can be sent.
            </Text>
          </View>
        ) : null}
      </View>

      <Section title="Needs you" style={styles.firstSection}>
        <SettingsGroup style={styles.group}>
          <SettingsRow
            icon={icon(ArrowCounterClockwise)}
            label="Refund requests"
            value={toReview > 0 ? `${toReview} to review` : 'All clear'}
            onPress={() => router.push(`/manage/space/${spaceId}/refunds`)}
          />
        </SettingsGroup>
      </Section>

      {/* How the number is reached — reconciles top to bottom */}
      <Section title="How it adds up" subtitle="Paid out + on the way + available">
        <SettingsGroup plain style={styles.group}>
          <SettingsRow label="Collected" value={inr(fin.collectedOverall)} />
          <SettingsRow label="App fees" value={`− ${inr(fin.processingFees)}`} />
          <SettingsRow label="Ticket revenue" value={inr(fin.ticketRevenue)} />
          <SettingsRow label="Refunded" value={fin.refunded ? `− ${inr(fin.refunded)}` : inr(0)} />
          <SettingsRow label="Platform fee" value={`− ${inr(fin.platformFee)}`} />
          <View style={styles.total}>
            <Text style={[styles.totalLabel, { color: c.text }]}>My earnings</Text>
            <Text style={[styles.totalValue, { color: c.text }]}>{inr(fin.netEntitlement)}</Text>
          </View>
        </SettingsGroup>
        <Text style={[styles.note, { color: c.muted }]}>App fees are charged to buyers and kept by Unifesto.</Text>
      </Section>

      <Section
        title="Recent payouts"
        onSeeAll={payouts.length > 0 ? () => router.push(`/manage/space/${spaceId}/payouts`) : undefined}
      >
        <SettingsGroup plain style={styles.group}>
          {payouts.length === 0 ? (
            <SettingsRow label="No payouts yet" />
          ) : (
            payouts.slice(0, 4).map((p) => <PayoutRow key={p.id} payout={p} inCard />)
          )}
        </SettingsGroup>
      </Section>

      <Section title="Where it goes">
        <SettingsGroup style={styles.group}>
          <SettingsRow
            icon={icon(Bank)}
            label="My payout accounts"
            value={accounts ? String(accounts.length) : undefined}
            external
            onPress={() => openSpaceWeb('/financials', spaceId)}
          />
        </SettingsGroup>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  eyebrow: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  heroValue: { marginTop: spacing[2], fontSize: 32, lineHeight: 42, ...cosmosFont.figure },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  warn: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start', marginTop: spacing[3], padding: spacing[4], borderRadius: cosmosCardRadius },
  warnText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  firstSection: { marginTop: spacing[10] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  // The bottom line of the reconciliation: a real total, not one more row.
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  totalLabel: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  totalValue: { fontSize: 17, lineHeight: 24, ...cosmosFont.figure },
  note: {
    marginTop: spacing[3],
    marginHorizontal: GUTTER + spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.45,
    ...cosmosFont.body,
  },
});
