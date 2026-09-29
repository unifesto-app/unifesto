import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bed, CaretRight, House, MapPin, Moon } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  dayLabel,
  GENDER_LABELS,
  getEventStays,
  PAYMENT_LABELS,
  priceLabel,
  PROPERTY_LABELS,
  STATUS_LABELS,
  type EventStays,
  type Stay,
  type StayOption,
} from '../lib/api/stays';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * Unifesto Stay for one event: the places the event team has arranged, what
 * can be booked at each, and how many beds are left. Registered attendees tap
 * an option to request it; anyone who already has a stay sees it on top.
 */
export default function StayBrowseScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<EventStays | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('StayBrowse');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getEventStays(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const book = (stay: Stay, option: StayOption) =>
    router.push({ pathname: '/stay/book', params: { eventId: data.event.id, stayId: stay.id, optionId: option.id } });

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
      <Text style={[styles.kicker, { color: tokens.accent }]}>UNIFESTO STAY</Text>
      <Text style={[styles.title, { color: tokens.text }]}>Stay for {data.event.title}</Text>
      <Text style={[styles.intro, { color: tokens.textSecondary }]}>
        Places to stay arranged by the event team. Pick one, send your details, and your Stay Pass arrives once they
        confirm.
      </Text>

      {data.myBooking ? (
        <SettingsGroup title="Your stay">
          <SettingsRow
            icon={<Bed size={24} color={tokens.accent} weight="duotone" />}
            label={data.stays.find((s) => s.id === data.myBooking!.stayId)?.name ?? 'Your stay'}
            value={STATUS_LABELS[data.myBooking.status]}
            onPress={() => router.push(`/stay/pass/${data.myBooking!.id}`)}
          />
        </SettingsGroup>
      ) : !data.registered ? (
        <View style={[styles.notice, { backgroundColor: tokens.fill }]}>
          <Text style={[styles.noticeText, { color: tokens.text }]}>Register for the event first, then book a stay here.</Text>
        </View>
      ) : null}

      {data.stays.length === 0 ? (
        <View style={styles.empty}>
          <House size={40} color={tokens.textMuted} weight="duotone" />
          <Text style={[styles.muted, { color: tokens.textMuted }]}>No stays have been listed for this event yet.</Text>
        </View>
      ) : null}

      {data.stays.map((stay) => (
        <View key={stay.id} style={styles.card}>
          <CardBackdrop shape={styles.card} />
          {stay.coverImageUrl ? <Image source={{ uri: stay.coverImageUrl }} style={styles.cover} contentFit="cover" /> : null}
          <View style={styles.cardBody}>
            <Text style={[styles.stayName, { color: tokens.text }]}>{stay.name}</Text>
            <Text style={[styles.meta, { color: tokens.textSecondary }]}>
              {[PROPERTY_LABELS[stay.propertyType], stay.city].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.factRow}>
              <Moon size={16} color={tokens.textMuted} />
              <Text style={[styles.meta, { color: tokens.textMuted }]}>
                {dayLabel(stay.checkInFrom)} to {dayLabel(stay.checkOutUntil)}
                {stay.checkInTime ? ` · check-in ${stay.checkInTime}` : ''}
              </Text>
            </View>
            {stay.address ? (
              <Pressable
                style={styles.factRow}
                disabled={!stay.mapUrl}
                onPress={() => stay.mapUrl && Linking.openURL(stay.mapUrl)}
                accessibilityRole={stay.mapUrl ? 'link' : undefined}
              >
                <MapPin size={16} color={stay.mapUrl ? tokens.accent : tokens.textMuted} />
                <Text style={[styles.meta, { color: stay.mapUrl ? tokens.accent : tokens.textMuted, flex: 1 }]} numberOfLines={2}>
                  {stay.address}
                </Text>
              </Pressable>
            ) : null}
            {stay.amenities.length ? (
              <View style={styles.chips}>
                {stay.amenities.map((a) => (
                  <View key={a} style={[styles.chip, { backgroundColor: tokens.fill }]}>
                    <Text style={[styles.chipText, { color: tokens.textSecondary }]}>{a}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {stay.description ? (
              <Text style={[styles.body, { color: tokens.textSecondary }]} numberOfLines={4}>
                {stay.description}
              </Text>
            ) : null}
          </View>

          {stay.options.map((o) => {
            const left = o.bedsLeft ?? 0;
            const disabled = !data.canBook || left === 0;
            return (
              <Pressable
                key={o.id}
                onPress={() => book(stay, o)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                style={({ pressed }) => [
                  styles.option,
                  { borderTopColor: tokens.border, opacity: disabled && !data.myBooking ? 0.55 : 1 },
                  pressed && { backgroundColor: tokens.pressed },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.optionName, { color: tokens.text }]}>{o.name}</Text>
                  <Text style={[styles.meta, { color: tokens.textMuted }]}>
                    {[o.gender !== 'ANY' ? GENDER_LABELS[o.gender] : null, o.maxGuests > 1 ? `Up to ${o.maxGuests} per request` : null, o.price ? PAYMENT_LABELS[o.paymentMode] : null]
                      .filter(Boolean)
                      .join(' · ') || 'Open to everyone'}
                  </Text>
                  <Text style={[styles.meta, { color: left === 0 ? tokens.danger : left <= 5 ? tokens.warning : tokens.success }]}>
                    {left === 0 ? 'Full on some nights' : `${left} bed${left === 1 ? '' : 's'} left`}
                  </Text>
                </View>
                <Text style={[styles.price, { color: tokens.text }]}>{priceLabel(o)}</Text>
                {!disabled ? <CaretRight size={16} color={tokens.textMuted} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      {data.stays.some((s) => s.contactPhone) ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Questions about a stay? Call the contact listed on your Stay Pass once you have one.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  kicker: { fontSize: typography.fontSize.xs, letterSpacing: 1.5, ...font('semibold') },
  title: { marginTop: spacing[1], fontSize: typography.fontSize['2xl'], lineHeight: typography.fontSize['2xl'] * 1.2, ...font('heading') },
  intro: { marginTop: spacing[2], marginBottom: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  notice: { marginTop: spacing[4], padding: spacing[4], borderRadius: borderRadius.lg },
  noticeText: { fontSize: typography.fontSize.sm, ...font('medium') },
  empty: { alignItems: 'center', gap: spacing[3], marginTop: spacing[12] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  card: { marginTop: spacing[6], borderRadius: borderRadius['2xl'], overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 16 / 9 },
  cardBody: { padding: spacing[5], gap: spacing[2] },
  stayName: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.2, ...font('heading') },
  meta: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...font() },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
  chip: { paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: borderRadius.full },
  chipText: { fontSize: typography.fontSize.xs, ...font('medium') },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  optionName: { fontSize: typography.fontSize.base, ...font('semibold') },
  price: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[5], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
