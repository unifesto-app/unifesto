import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Check } from '@unifesto/unicon/react-native';
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
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
  const c = useCosmos();
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!loaded) {
    return (
      <CosmosScreen>
        <View style={styles.pad}>
          <Skeleton width="100%" height={200} borderRadius={cosmosCardRadius} />
          <Skeleton width="100%" height={170} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
        </View>
      </CosmosScreen>
    );
  }

  const usageStats = usage
    ? [
        { label: 'Events this month', value: `${usage.eventsThisMonth}/${limitLabel(usage.limits.eventsPerMonth)}` },
        { label: 'Attendees an event', value: limitLabel(usage.limits.attendeesPerEvent) },
      ]
    : [];

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.pad}>
        {error ? (
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <Text style={[styles.body, { color: c.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* The plan, what it's costing and how much of it is used. */}
        {sub ? (
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <Text style={[styles.eyebrow, { color: c.muted }]}>Current plan</Text>
            <Text style={[styles.plan, { color: c.text }]} accessibilityRole="header">
              {PLAN_LABEL[current]}
            </Text>
            <Text style={[styles.body, { color: c.soft }]}>{billingSummary(sub)}</Text>
            {usageStats.length > 0 ? (
              <View style={[styles.stats, { borderTopColor: c.border }]}>
                {usageStats.map((st) => (
                  <View key={st.label} style={styles.stat} accessible accessibilityLabel={`${st.label}, ${st.value}`}>
                    <Text style={[styles.statValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {st.value}
                    </Text>
                    <Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={1}>
                      {st.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {sub ? (
        <Section title="Details" style={styles.firstSection}>
          <SettingsGroup plain style={styles.group}>
            <SettingsRow label="Status" value={sub.isActive ? 'Active' : 'Inactive'} />
            <SettingsRow label={sub.cancelledAt ? 'Ends' : 'Renews'} value={day(sub.expiresAt)} />
            <SettingsRow label="Last payment" value={day(sub.lastPaymentAt)} />
          </SettingsGroup>
        </Section>
      ) : null}

      {plans.length > 0 ? (
        <Section title="Plans" subtitle="Plan changes are made in Unifesto Space on the web">
          <View style={styles.pad}>
            <SegmentedTabs tabs={CYCLES} value={cycle} onChange={setCycle} />
            <View style={styles.plans}>
              {plans.map((p) => {
                const price = cycle === 'MONTHLY' ? p.monthlyPrice : p.annualPrice;
                const isCurrent = p.plan === current;
                return (
                  <View
                    key={p.plan}
                    style={[styles.card, { backgroundColor: c.raised }, isCurrent && { borderWidth: 1, borderColor: c.outline }]}
                  >
                    <View style={styles.cardHead}>
                      <Text style={[styles.cardTitle, { color: c.text }]}>{PLAN_LABEL[p.plan]}</Text>
                      {isCurrent ? (
                        <View style={[styles.pill, { backgroundColor: c.tint }]}>
                          <Text style={[styles.pillText, { color: c.text }]}>Current</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.price, { color: c.text }]}>
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
                        <Check size={16} color={c.success} weight="bold" />
                        <Text style={[styles.featureText, { color: c.soft }]}>{line}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        </Section>
      ) : null}

      {canCancel ? (
        <View style={styles.pad}>
          <AuthButton label="Cancel plan" variant="danger" loading={cancelling} onPress={confirmCancel} style={{ marginTop: spacing[10] }} />
        </View>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  eyebrow: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  plan: { marginTop: spacing[2], fontSize: 24, lineHeight: 32, ...cosmosFont.display },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  stats: { flexDirection: 'row', marginTop: spacing[5], paddingTop: spacing[4], borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.display },
  statLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  firstSection: { marginTop: spacing[10] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  plans: { marginTop: spacing[4], gap: spacing[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 12, ...cosmosFont.strong },
  price: { marginTop: spacing[2], marginBottom: spacing[3], fontSize: typography.fontSize.xl, ...cosmosFont.strong },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  featureText: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
