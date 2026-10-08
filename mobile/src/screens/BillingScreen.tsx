import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams } from 'expo-router';
import { Check } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  billingSummary,
  cancelSubscription,
  getPlans,
  getSubscription,
  getUsage,
  limitLabel,
  PLAN_FEATURES,
  PLAN_LABEL,
  PLAN_ORDER,
  type BillingCycle,
  type PlanInfo,
  type Subscription,
  type Usage,
} from '../lib/api/billing';
import ManageStats from '../components/manage/ManageStats';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const CYCLES = [
  { key: 'MONTHLY' as const, label: 'Monthly' },
  { key: 'ANNUAL' as const, label: 'Annual' },
];

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * The space's plan, this month's usage and the plan catalogue. Cancelling is
 * allowed here; buying or switching a paid plan is done in Unifesto Space on
 * the web, since a subscription sold inside the iOS app would have to go
 * through Apple's in-app purchase.
 */
export default function BillingScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useAnalyticsScreenTracking('Billing');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const [s, u, p] = await Promise.all([getSubscription(spaceId), getUsage(spaceId), getPlans()]);
    if (s.ok) {
      setSub(s.data);
      setCycle(s.data.billingCycle ?? 'MONTHLY');
      setError('');
    } else setError(s.denied ? 'Billing is for Space admins.' : s.message);
    if (u.ok) setUsage(u.data);
    if (p.ok) setPlans([...p.data].sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan)));
    setLoaded(true);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = sub?.plan ?? 'STARTER';
  const canCancel = PLAN_ORDER.indexOf(current) > 0 && !sub?.cancelledAt;

  const confirmCancel = () =>
    AppAlert.alert('Cancel this plan?', 'The space drops to Starter at the end of the current period.', [
      { text: 'Keep plan', style: 'cancel' },
      {
        text: 'Cancel plan',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const res = await cancelSubscription(spaceId!);
          setCancelling(false);
          if (!res.ok) {
            AppAlert.alert("Couldn't cancel", res.message);
            return;
          }
          await load();
        },
      },
    ]);

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}

      {sub ? (
        <>
          <Text style={[styles.plan, { color: tokens.text }]}>{PLAN_LABEL[current]} plan</Text>
          <Text style={[styles.summary, { color: tokens.textSecondary }]}>{billingSummary(sub)}</Text>

          <SettingsGroup>
            <SettingsRow label="Status" value={sub.isActive ? 'Active' : 'Inactive'} />
            <SettingsRow label={sub.cancelledAt ? 'Ends' : 'Renews'} value={day(sub.expiresAt)} />
            <SettingsRow label="Last payment" value={day(sub.lastPaymentAt)} />
          </SettingsGroup>
        </>
      ) : null}

      {usage ? (
        <View style={{ marginTop: spacing[6] }}>
          <ManageStats
            stats={[
              { label: 'Events this month', value: `${usage.eventsThisMonth}/${limitLabel(usage.limits.eventsPerMonth)}` },
              { label: 'Per event', value: limitLabel(usage.limits.attendeesPerEvent) },
            ]}
          />
        </View>
      ) : null}

      {plans.length > 0 ? (
        <>
          <View style={styles.plansHead}>
            <Text style={[styles.section, { color: tokens.text }]}>Plans</Text>
          </View>
          <SegmentedTabs tabs={CYCLES} value={cycle} onChange={setCycle} />
          <View style={styles.plans}>
            {plans.map((p) => {
              const price = cycle === 'MONTHLY' ? p.monthlyPrice : p.annualPrice;
              const isCurrent = p.plan === current;
              return (
                <View key={p.plan} style={styles.card}>
                  <CardBackdrop shape={styles.card} />
                  <View style={styles.cardHead}>
                    <Text style={[styles.cardTitle, { color: tokens.text }]}>{PLAN_LABEL[p.plan]}</Text>
                    {isCurrent ? <Text style={[styles.current, { color: tokens.accent }]}>Current</Text> : null}
                  </View>
                  <Text style={[styles.price, { color: tokens.text }]}>
                    {p.plan === 'ENTERPRISE'
                      ? 'Custom'
                      : !price
                        ? 'Free'
                        : `₹${price.toLocaleString('en-IN')}/${cycle === 'MONTHLY' ? 'mo' : 'yr'}`}
                  </Text>
                  {[
                    `${limitLabel(p.eventsPerMonth)} events a month`,
                    `${limitLabel(p.attendeesPerEvent)} attendees an event`,
                    ...PLAN_FEATURES.filter((f) => p[f.key]).map((f) => f.label),
                  ].map((line) => (
                    <View key={line} style={styles.feature}>
                      <Check size={16} color={tokens.success} weight="bold" />
                      <Text style={[styles.featureText, { color: tokens.textSecondary }]}>{line}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
          <Text style={[styles.note, { color: tokens.textMuted }]}>Plan changes are made in Unifesto Space on the web.</Text>
        </>
      ) : null}

      {canCancel ? (
        <Button
          label="Cancel plan"
          variant="danger"
          fullWidth
          loading={cancelling}
          onPress={confirmCancel}
          style={{ marginTop: spacing[8] }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plan: { fontSize: typography.fontSize['2xl'], marginLeft: spacing[1], ...font('heading') },
  summary: { marginTop: spacing[1], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  plansHead: { marginTop: spacing[10], marginBottom: spacing[3] },
  section: { fontSize: typography.fontSize.lg, marginLeft: spacing[1], ...font('heading') },
  plans: { marginTop: spacing[4], gap: spacing[3] },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[5] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: typography.fontSize.lg, ...font('heading') },
  current: { fontSize: typography.fontSize.sm, ...font('semibold') },
  price: { marginTop: spacing[1], marginBottom: spacing[3], fontSize: typography.fontSize.xl, ...font('semibold') },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  featureText: { fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
