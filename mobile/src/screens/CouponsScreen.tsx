import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { describeDiscount, getCoupons, type Coupon } from '../lib/api/coupons';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

function state(c: Coupon, now: number) {
  if (!c.isActive) return 'Off';
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return 'Ended';
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return 'Scheduled';
  if (c.usageLimit != null && c.confirmedCount >= c.usageLimit) return 'Used up';
  return 'Live';
}

/** Discount codes for one event. Tap to edit, or add a new one. */
export default function CouponsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Coupons');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getCoupons(eventId);
    if (res.ok) {
      setCoupons(res.data);
      setError('');
    } else {
      setError(res.denied ? "You can't manage this event's codes." : res.message);
      setCoupons((c) => c ?? []);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (couponId: string) => router.push({ pathname: `/manage/event/${eventId}/coupon`, params: { couponId } });

  if (!coupons) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const now = Date.now();

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
      <Text style={[styles.intro, { color: tokens.textSecondary }]}>
        Buyers enter a code at checkout. Discounts come off the ticket price, not the processing fee.
      </Text>
      {error ? <Text style={[styles.intro, { color: tokens.danger }]}>{error}</Text> : null}

      <SettingsGroup>
        {coupons.length === 0 ? <SettingsRow label="No codes yet" /> : null}
        {coupons.map((c) => {
          const s = state(c, now);
          return (
            <View key={c.id}>
              <SettingsRow
                label={c.code}
                value={s}
                onPress={() => open(c.id)}
              />
              <Text style={[styles.sub, { color: s === 'Live' ? tokens.textMuted : tokens.warning }]} onPress={() => open(c.id)}>
                {describeDiscount(c)} · used {c.confirmedCount}
                {c.usageLimit != null ? ` of ${c.usageLimit}` : ''}
              </Text>
            </View>
          );
        })}
      </SettingsGroup>

      <Button
        label="New code"
        variant="secondary"
        fullWidth
        icon={<Plus size={18} color={tokens.text} weight="bold" />}
        onPress={() => open('new')}
        style={{ marginTop: spacing[5] }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
});
