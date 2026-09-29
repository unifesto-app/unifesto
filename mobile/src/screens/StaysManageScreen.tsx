import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bed, ClipboardText, House, Plus, QrCode } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { dayLabel, getTeamStays, PROPERTY_LABELS, type TeamStay } from '../lib/api/stays';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * Unifesto Stay for the event team: the stays on this event, the request
 * queue, and the property desk (scan Stay Passes at check-in).
 */
export default function StaysManageScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<{ pendingRequests: number; stays: TeamStay[] } | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('StaysManage');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getTeamStays(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else {
      setError(res.denied ? "You can't manage stays for this event." : res.message);
      setData((d) => d ?? { pendingRequests: 0, stays: [] });
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const totals = data.stays.reduce(
    (t, s) => ({
      beds: t.beds + s.options.filter((o) => o.isActive).reduce((n, o) => n + o.totalBeds, 0),
      guests: t.guests + s.counts.confirmedGuests,
      checkedIn: t.checkedIn + s.counts.checkedIn,
    }),
    { beds: 0, guests: 0, checkedIn: 0 },
  );
  const openStay = (stayId: string) => router.push({ pathname: `/manage/event/${eventId}/stay`, params: { stayId } });

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
        List where attendees can stay. Registered attendees request a bed with their details, you approve, and they get a
        Stay Pass to show at check-in.
      </Text>
      {error ? <Text style={[styles.intro, { color: tokens.danger }]}>{error}</Text> : null}

      {data.stays.length ? (
        <View style={{ marginTop: spacing[4] }}>
          <ManageStats
            stats={[
              { label: 'Requests', value: data.pendingRequests },
              { label: 'Guests confirmed', value: totals.guests },
              { label: 'Checked in', value: totals.checkedIn },
            ]}
          />
        </View>
      ) : null}

      <SettingsGroup title="Bookings">
        <SettingsRow
          icon={<ClipboardText size={24} color={tokens.accent} weight="fill" />}
          label="Requests and guests"
          value={data.pendingRequests ? `${data.pendingRequests} new` : undefined}
          onPress={() => router.push(`/manage/event/${eventId}/stay-bookings`)}
        />
        <SettingsRow
          icon={<QrCode size={24} color={tokens.accent} weight="fill" />}
          label="Scan Stay Pass"
          onPress={() => router.push(`/manage/event/${eventId}/stay-scan`)}
        />
      </SettingsGroup>

      <SettingsGroup title="Stays">
        {data.stays.length === 0 ? (
          <SettingsRow icon={<House size={24} color={tokens.textMuted} />} label="No stays yet" />
        ) : null}
        {data.stays.map((s) => {
          const beds = s.options.filter((o) => o.isActive).reduce((n, o) => n + o.totalBeds, 0);
          return (
            <View key={s.id}>
              <SettingsRow
                icon={<Bed size={24} color={s.isPublished ? tokens.accent : tokens.textMuted} weight="fill" />}
                label={s.name}
                value={s.isPublished ? (s.counts.pending ? `${s.counts.pending} new` : 'Live') : 'Hidden'}
                onPress={() => openStay(s.id)}
              />
              <Text style={[styles.sub, { color: tokens.textMuted }]} onPress={() => openStay(s.id)}>
                {PROPERTY_LABELS[s.propertyType]} · {dayLabel(s.checkInFrom)} to {dayLabel(s.checkOutUntil)} · {beds} bed{beds === 1 ? '' : 's'}
                {s.counts.confirmedGuests ? ` · ${s.counts.confirmedGuests} confirmed` : ''}
              </Text>
            </View>
          );
        })}
      </SettingsGroup>

      <Button
        label="Add a stay"
        variant="secondary"
        fullWidth
        icon={<Plus size={18} color={tokens.text} weight="bold" />}
        onPress={() => openStay('new')}
        style={{ marginTop: spacing[5] }}
      />
      {totals.beds === 0 && data.stays.length ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>Add room or bed options to a stay, then publish it.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  sub: { marginTop: -spacing[2], paddingLeft: spacing[4] + 40, paddingRight: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
