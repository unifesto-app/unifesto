import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bed, CaretRight, House, MapPin, Moon } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import useTopSpacing from '../hooks/useTopSpacing';
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
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];

/**
 * Unifesto Stay for one event: the places the event team has arranged, what
 * can be booked at each, and how many beds are left. Registered attendees tap
 * an option to request it; anyone who already has a stay sees it on top.
 */
export default function StayBrowseScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<EventStays | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? (
          <>
            <Text style={[styles.muted, { color: c.muted }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={c.primary} />
        )}
      </View>
    );
  }

  const book = (stay: Stay, option: StayOption) =>
    router.push({ pathname: '/stay/book', params: { eventId: data.event.id, stayId: stay.id, optionId: option.id } });

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
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
          tintColor={c.primary}
          colors={[c.primary]}
          progressViewOffset={topSpacing}
        />
      }
    >
      <Text style={[styles.kicker, { color: c.primary }]}>UNIFESTO STAY</Text>
      <Text style={[styles.title, { color: c.text }]}>Stay for {data.event.title}</Text>
      <Text style={[styles.intro, { color: c.soft }]}>
        Places to stay arranged by the event team. Pick one, send your details, and your Stay Pass arrives once they
        confirm.
      </Text>

      {data.myBooking ? (
        <SettingsGroup title="Your stay">
          <SettingsRow
            icon={<Bed size={24} color={c.primary} weight="duotone" />}
            label={data.stays.find((s) => s.id === data.myBooking!.stayId)?.name ?? 'Your stay'}
            value={STATUS_LABELS[data.myBooking.status]}
            onPress={() => router.push(`/stay/pass/${data.myBooking!.id}`)}
          />
        </SettingsGroup>
      ) : !data.registered ? (
        <View style={[styles.notice, { backgroundColor: c.tint }]}>
          <Text style={[styles.noticeText, { color: c.text }]}>Register for the event first, then book a stay here.</Text>
        </View>
      ) : null}

      {data.stays.length === 0 ? (
        <View style={styles.empty}>
          <House size={40} color={c.muted} weight="duotone" />
          <Text style={[styles.muted, { color: c.muted }]}>No stays have been listed for this event yet.</Text>
        </View>
      ) : null}

      {data.stays.map((stay) => (
        <View key={stay.id} style={styles.card}>
          <CardBackdrop shape={styles.card} />
          <StayPhotos urls={[stay.coverImageUrl, ...(stay.galleryUrls ?? [])].filter((u): u is string => !!u)} />
          <View style={styles.cardBody}>
            <Text style={[styles.stayName, { color: c.text }]}>{stay.name}</Text>
            <Text style={[styles.meta, { color: c.soft }]}>
              {[PROPERTY_LABELS[stay.propertyType], stay.city].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.factRow}>
              <Moon size={16} color={c.muted} />
              <Text style={[styles.meta, { color: c.muted }]}>
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
                <MapPin size={16} color={stay.mapUrl ? c.primary : c.muted} />
                <Text style={[styles.meta, { color: stay.mapUrl ? c.primary : c.muted, flex: 1 }]} numberOfLines={2}>
                  {stay.address}
                </Text>
              </Pressable>
            ) : null}
            {stay.amenities.length ? (
              <View style={styles.chips}>
                {stay.amenities.map((a) => (
                  <View key={a} style={[styles.chip, { backgroundColor: c.tint }]}>
                    <Text style={[styles.chipText, { color: c.soft }]}>{a}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {stay.description ? (
              <Text style={[styles.body, { color: c.soft }]} numberOfLines={4}>
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
                  { borderTopColor: c.border, opacity: disabled && !data.myBooking ? 0.55 : 1 },
                  pressed && { backgroundColor: c.tint },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.optionName, { color: c.text }]}>{o.name}</Text>
                  <Text style={[styles.meta, { color: c.muted }]}>
                    {[o.gender !== 'ANY' ? GENDER_LABELS[o.gender] : null, o.maxGuests > 1 ? `Up to ${o.maxGuests} per request` : null, o.price ? PAYMENT_LABELS[o.paymentMode] : null]
                      .filter(Boolean)
                      .join(' · ') || 'Open to everyone'}
                  </Text>
                  <Text style={[styles.meta, { color: left === 0 ? c.danger : left <= 5 ? c.warn : c.success }]}>
                    {left === 0 ? 'Full on some nights' : `${left} bed${left === 1 ? '' : 's'} left`}
                  </Text>
                </View>
                <Text style={[styles.price, { color: c.text }]}>{priceLabel(o)}</Text>
                {!disabled ? <CaretRight size={16} color={c.muted} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      {data.stays.some((s) => s.contactPhone) ? (
        <Text style={[styles.note, { color: c.muted }]}>
          Questions about a stay? Call the contact listed on your Stay Pass once you have one.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Cover first, then the gallery; swipe through, one photo per page. */
function StayPhotos({ urls }: { urls: string[] }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  if (urls.length === 0) return null;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  return (
    <View style={styles.cover} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll}>
        {urls.map((url) => (
          <Image key={url} source={{ uri: url }} style={{ width, height: '100%' }} contentFit="cover" />
        ))}
      </ScrollView>
      {urls.length > 1 ? (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {page + 1} / {urls.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  kicker: { fontSize: typography.fontSize.xs, letterSpacing: 1.5, ...cosmosFont.strong },
  title: { marginTop: spacing[1], fontSize: typography.fontSize['2xl'], lineHeight: typography.fontSize['2xl'] * 1.2, ...cosmosFont.display },
  intro: { marginTop: spacing[2], marginBottom: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  notice: { marginTop: spacing[4], padding: spacing[4], borderRadius: borderRadius.lg },
  noticeText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  empty: { alignItems: 'center', gap: spacing[3], marginTop: spacing[12] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  card: { marginTop: spacing[6], borderRadius: borderRadius['2xl'], overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 16 / 9 },
  counter: { position: 'absolute', right: spacing[3], bottom: spacing[3], paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: borderRadius.full, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { color: '#ffffff', fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  cardBody: { padding: spacing[5], gap: spacing[2] },
  stayName: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.2, ...cosmosFont.display },
  meta: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
  chip: { paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: borderRadius.full },
  chipText: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  optionName: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  price: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[5], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
