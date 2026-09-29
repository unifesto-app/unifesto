import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FileCsv, MagnifyingGlass } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { shareCsv } from '../lib/csvShare';
import {
  dayLabel,
  getStayBookings,
  GUEST_GENDER_LABELS,
  PAYMENT_LABELS,
  STATUS_LABELS,
  type StayBookingStatus,
  type TeamStayBooking,
} from '../lib/api/stays';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

type Tab = 'requests' | 'pay' | 'guests' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'requests', label: 'Requests' },
  { key: 'pay', label: 'To pay' },
  { key: 'guests', label: 'Guests' },
  { key: 'all', label: 'All' },
];
const IN_TAB: Record<Tab, StayBookingStatus[] | null> = {
  requests: ['PENDING'],
  pay: ['AWAITING_PAYMENT'],
  guests: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'],
  all: null,
};

/**
 * Stay requests and guests for one event. New requests first; tap one to
 * review the guests, their IDs and answers, then approve and assign a room.
 */
export default function StayBookingsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [rows, setRows] = useState<TeamStayBooking[] | null>(null);
  const [tab, setTab] = useState<Tab>('requests');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  useAnalyticsScreenTracking('StayBookings');

  const load = useCallback(async () => {
    if (!eventId) return;
    const gen = ++generation.current;
    const res = await getStayBookings(eventId, { search });
    if (gen !== generation.current) return;
    if (res.ok) {
      setRows(res.data);
      setError('');
    } else {
      setError(res.denied ? "You can't see this event's stay bookings." : res.message);
      setRows((r) => r ?? []);
    }
  }, [eventId, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const shown = (rows ?? []).filter((b) => !IN_TAB[tab] || IN_TAB[tab]!.includes(b.status));
  const countFor = (t: Tab) => (rows ?? []).filter((b) => !IN_TAB[t] || IN_TAB[t]!.includes(b.status)).length;

  const exportCsv = async () => {
    const guests = (rows ?? []).filter((b) => IN_TAB.guests!.includes(b.status));
    if (!guests.length) return AppAlert.alert('Nothing to export', 'Confirmed guests show up here.');
    const ok = await shareCsv(
      `stay-guests-${eventId}.csv`,
      ['Pass', 'Stay', 'Option', 'Check in', 'Check out', 'Guest', 'Gender', 'Phone', 'Email', 'Booker', 'Room / bed', 'Payment', 'Amount', 'Paid', 'Status', 'Emergency contact'],
      guests.flatMap((b) =>
        b.guests.map((g) => [
          b.passCode,
          b.stay.name,
          b.option.name,
          b.checkInDate,
          b.checkOutDate,
          g.name,
          GUEST_GENDER_LABELS[g.gender],
          g.phone ?? '',
          g.email ?? '',
          g.isBooker ? 'Yes' : '',
          b.allocation ?? '',
          b.totalAmount ? PAYMENT_LABELS[b.paymentMode] : 'Free',
          b.totalAmount,
          b.paymentStatus === 'PAID' ? 'Yes' : b.totalAmount ? 'No' : '',
          STATUS_LABELS[b.status],
          [b.emergencyName, b.emergencyPhone].filter(Boolean).join(' '),
        ]),
      ),
    );
    if (!ok) AppAlert.alert("Couldn't export", 'Sharing is not available on this device.');
  };

  if (!rows) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      data={shown}
      keyExtractor={(b) => b.id}
      keyboardShouldPersistTaps="handled"
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
      ListHeaderComponent={
        <View style={{ gap: spacing[4], marginBottom: spacing[4] }}>
          <View style={[styles.search, { backgroundColor: tokens.fill }]}>
            <MagnifyingGlass size={18} color={tokens.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Name, phone, pass or room"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: tokens.text }]}
            />
          </View>
          <SegmentedTabs tabs={TABS.map((t) => ({ ...t, label: `${t.label}${countFor(t.key) ? ` ${countFor(t.key)}` : ''}` }))} value={tab} onChange={setTab} />
          {error ? <Text style={[styles.meta, { color: tokens.danger }]}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: tokens.textMuted }]}>
          {tab === 'requests' ? 'No new requests.' : tab === 'pay' ? 'Nobody is waiting to pay.' : 'Nothing here yet.'}
        </Text>
      }
      ListFooterComponent={
        tab === 'guests' && shown.length ? (
          <Button
            label="Export guest list"
            variant="secondary"
            fullWidth
            icon={<FileCsv size={18} color={tokens.text} />}
            onPress={() => void exportCsv()}
            style={{ marginTop: spacing[5] }}
          />
        ) : null
      }
      renderItem={({ item: b }) => {
        const booker = b.guests.find((g) => g.isBooker) ?? b.guests[0];
        const tone =
          b.status === 'PENDING' || b.status === 'AWAITING_PAYMENT'
            ? tokens.warning
            : b.status === 'REJECTED' || b.status === 'CANCELLED' || b.status === 'EXPIRED'
              ? tokens.danger
              : tokens.success;
        return (
          <Pressable
            onPress={() => router.push(`/manage/event/${eventId}/stay-booking/${b.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tokens.pressed : tokens.surface }]}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
                {booker?.name || b.user.fullName || 'Guest'}
                {b.guestCount > 1 ? ` +${b.guestCount - 1}` : ''}
              </Text>
              <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
                {b.stay.name} · {b.option.name}
              </Text>
              <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
                {dayLabel(b.checkInDate)} → {dayLabel(b.checkOutDate)}
                {b.allocation ? ` · ${b.allocation}` : ''}
              </Text>
            </View>
            <Text style={[styles.status, { color: tone }]}>{STATUS_LABELS[b.status]}</Text>
          </Pressable>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], borderRadius: borderRadius.full, height: 44 },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: borderRadius.lg },
  name: { fontSize: typography.fontSize.base, ...font('semibold') },
  meta: { fontSize: typography.fontSize.xs, ...font() },
  status: { fontSize: typography.fontSize.xs, maxWidth: 110, textAlign: 'right', ...font('semibold') },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
