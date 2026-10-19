import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  cancelSubscription,
  getSubscription,
  getUsage,
  limitLabel,
  PLAN_LABEL,
  PLAN_ORDER,
  type Subscription,
  type Usage,
} from '../lib/api/billing';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * The space's plan name and this month's usage. Cancelling is allowed here.
 * No prices, catalogue or links to buy: plans are sold on the web, and showing
 * them here would be steering away from Apple's in-app purchase (App Store
 * 3.1.1 / 3.1.3).
 */
export default function BillingScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const c = useCosmos();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!spaceId) return;
    const [s, u] = await Promise.all([getSubscription(spaceId), getUsage(spaceId)]);
    if (s.ok) {
      setSub(s.data);
      setError('');
    } else setError(s.denied ? 'Billing is for Space admins.' : s.message);
    if (u.ok) setUsage(u.data);
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

        {/* The plan and how much of it is used. */}
        {sub ? (
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <Text style={[styles.eyebrow, { color: c.muted }]}>Current plan</Text>
            <Text style={[styles.plan, { color: c.text }]} accessibilityRole="header">
              {PLAN_LABEL[current]}
            </Text>
            <Text style={[styles.body, { color: c.soft }]}>Manage on web</Text>
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
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.figure },
  statLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  firstSection: { marginTop: spacing[10] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
});
