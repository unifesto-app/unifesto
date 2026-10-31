import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, CircleIcon } from '@unifesto/unicon/react-native';
import {
  describeAccount,
  getEligibleAccounts,
  getEventPayoutSummary,
  requestPayout,
  type EligibleAccount,
  type EventPayoutSummary,
} from '../lib/api/finance';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import ShadeCard from '../components/ui/ShadeCard';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER } from '../components/home/Section';
import { inr } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

type Mode = 'full' | 'custom';
const MODES: { key: Mode; label: string }[] = [
  { key: 'full', label: 'Everything' },
  { key: 'custom', label: 'Custom amount' },
];

/**
 * Request a payout for one event. Shows the balance (net − already paid or
 * queued = available), lets the admin take all of it or part, and pick which
 * verified account it goes to (their own or another Space Admin's).
 */
export default function RequestPayoutScreen() {
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [summary, setSummary] = useState<EventPayoutSummary | null>(null);
  const [accounts, setAccounts] = useState<EligibleAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<Mode>('full');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    void Promise.all([getEventPayoutSummary(eventId), getEligibleAccounts(eventId)]).then(([s, a]) => {
      if (cancelled) return;
      setLoading(false);
      if (!s.ok) {
        setError(s.message);
        return;
      }
      setSummary(s.data);
      if (a.ok) {
        const list = a.data.accounts;
        setAccounts(list);
        // The event's saved account, else the creator's primary, else the first one.
        const preset = a.data.selectedBankAccountId;
        const pick =
          (preset && list.find((x) => x.id === preset)) || list.find((x) => x.isOwn && x.isPrimary) || list[0];
        setAccountId(pick?.id ?? '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  if (!summary) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <View style={styles.emptyCard}>
          <CardBackdrop shape={styles.emptyCard} />
          <Text style={[styles.muted, { color: c.soft, textAlign: 'center' }]}>{error || 'Could not load this event’s balance.'}</Text>
        </View>
      </CosmosScreen>
    );
  }

  const available = summary.available;
  const custom = Number(amount);
  const amountProblem =
    mode === 'custom'
      ? !amount.trim()
        ? 'Enter an amount.'
        : !/^\d+(\.\d{1,2})?$/.test(amount.trim()) || custom <= 0
          ? 'Enter an amount like 5000.'
          : custom > available
            ? `That's more than the ${inr(available)} available.`
            : null
      : null;
  const payAmount = mode === 'full' ? available : custom;
  const account = accounts.find((a) => a.id === accountId);

  const submit = () => {
    if (amountProblem) {
      setError(amountProblem);
      return;
    }
    if (accounts.length === 0) {
      setError('Add and verify a payout account on the web first.');
      return;
    }
    AppAlert.alert(
      `Request ${inr(payAmount)}?`,
      `${account ? `To ${account.ownerName}'s ${describeAccount(account)}. ` : ''}Unifesto sends it by bank transfer, usually within a few working days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: async () => {
            setSubmitting(true);
            setError('');
            const res = await requestPayout(eventId!, mode === 'custom' ? custom : undefined, accountId || undefined);
            setSubmitting(false);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            AppAlert.alert('Payout requested', "You'll see it in history as queued until the transfer is made.", [
              { text: 'Done', onPress: () => router.back() },
            ]);
          },
        },
      ],
    );
  };

  return (
    <CosmosScreen keyboard keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
      {title ? (
        <Text style={[styles.event, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
      ) : null}

      {/* The balance: the screen's hero, on the money's ivory shade. */}
      <ShadeCard tone="ivory" style={title ? { marginTop: spacing[5] } : null}>
        <Text style={[styles.heroLabel, { color: c.soft }]}>Available</Text>
        <Text style={[styles.heroValue, { color: c.ivory }]} numberOfLines={1} adjustsFontSizeToFit>
          {inr(available)}
        </Text>
        <View style={[styles.line, styles.firstLine, { borderTopColor: c.border }]}>
          <Text style={[styles.lineLabel, { color: c.soft }]}>Event earnings</Text>
          <Text style={[styles.lineValue, { color: c.text }]}>{inr(summary.eventNet)}</Text>
        </View>
        <View style={[styles.line, { borderTopColor: c.border }]}>
          <Text style={[styles.lineLabel, { color: c.soft }]}>Paid out or queued</Text>
          <Text style={[styles.lineValue, { color: c.text }]}>
            {summary.committed > 0 ? `− ${inr(summary.committed)}` : inr(0)}
          </Text>
        </View>
      </ShadeCard>
      <Text style={[styles.note, { color: c.muted }]}>
        Earnings are after the {summary.defaultPlatformFeePercent}% platform fee and any refunds.
      </Text>

      {available <= 0 ? (
        <View style={[styles.emptyCard, { marginTop: spacing[8] }]}>
          <CardBackdrop shape={styles.emptyCard} />
          <Text style={[styles.empty, { color: c.soft }]}>Nothing left to pay out for this event.</Text>
        </View>
      ) : (
        <>
          <View style={{ marginTop: spacing[8] }}>
            <SegmentedTabs tabs={MODES} value={mode} onChange={(m) => { setMode(m); setError(''); }} />
          </View>
          {mode === 'custom' ? (
            <SettingsGroup plain>
              <FieldRow
                label="Amount (₹)"
                value={amount}
                onChangeText={(v) => { setAmount(v); setError(''); }}
                placeholder={`Up to ${inr(available)}`}
                keyboardType="decimal-pad"
                autoFocus
              />
            </SettingsGroup>
          ) : null}

          <SettingsGroup title="Pay to">
            {accounts.length === 0 ? (
              <SettingsRow label="No verified payout account" value="Add on web" />
            ) : (
              accounts.map((a) => {
                const selected = a.id === accountId;
                return (
                  <Pressable key={a.id} onPress={() => setAccountId(a.id)} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={describeAccount(a)} style={styles.account}>
                    {selected ? (
                      <CheckCircle size={24} color={c.primary} weight="fill" />
                    ) : (
                      <CircleIcon size={24} color={c.muted} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.accountName, { color: c.text }]} numberOfLines={1}>
                        {describeAccount(a)}
                      </Text>
                      <Text style={[styles.accountSub, { color: c.muted }]} numberOfLines={1}>
                        {a.isOwn ? a.accountHolderName : `${a.ownerName} · ${a.accountHolderName}`}
                        {a.isPrimary ? '  ·  Primary' : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </SettingsGroup>

          {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}

          <Button
            label={`Request ${mode === 'full' || !amountProblem ? inr(payAmount) : 'payout'}`}
            size="lg"
            fullWidth
            loading={submitting}
            onPress={submit}
            style={{ marginTop: spacing[6] }}
          />
        </>
      )}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  emptyCard: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  muted: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  event: { fontSize: typography.fontSize['2xl'], lineHeight: 30, ...cosmosFont.display, letterSpacing: displayTracking(24) },
  heroLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  heroValue: { marginTop: spacing[1], fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  firstLine: { marginTop: spacing[4] },
  lineLabel: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  lineValue: { fontSize: typography.fontSize.base, ...cosmosFont.figure },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  empty: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 56 },
  accountName: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  accountSub: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  error: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
