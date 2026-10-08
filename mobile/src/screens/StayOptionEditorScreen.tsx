import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from '@unifesto/unicon/react-native';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createStayOption,
  deleteStayOption,
  GENDER_LABELS,
  getTeamStay,
  updateStayOption,
  type StayGender,
  type StayOption,
  type StayOptionInput,
  type StayPaymentMode,
  type StayPricing,
} from '../lib/api/stays';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const GENDERS = (['ANY', 'MALE', 'FEMALE'] as StayGender[]).map((k) => ({ key: k, label: GENDER_LABELS[k] }));
const PRICING = [
  { key: 'PER_NIGHT' as StayPricing, label: 'Per night' },
  { key: 'PER_STAY' as StayPricing, label: 'Per stay' },
];
const PAYMENT = [
  { key: 'PAY_AT_PROPERTY' as StayPaymentMode, label: 'At the property' },
  { key: 'ONLINE' as StayPaymentMode, label: 'In the app' },
];

interface Draft {
  name: string;
  description: string;
  gender: StayGender;
  totalBeds: string;
  price: string;
  pricing: StayPricing;
  paymentMode: StayPaymentMode;
  maxGuests: string;
  isActive: boolean;
}

const EMPTY: Draft = {
  name: '',
  description: '',
  gender: 'ANY',
  totalBeds: '',
  price: '0',
  pricing: 'PER_NIGHT',
  paymentMode: 'PAY_AT_PROPERTY',
  maxGuests: '1',
  isActive: true,
};

const toDraft = (o: StayOption): Draft => ({
  name: o.name,
  description: o.description ?? '',
  gender: o.gender,
  totalBeds: String(o.totalBeds),
  price: String(o.price),
  pricing: o.pricing,
  paymentMode: o.paymentMode === 'FREE' ? 'PAY_AT_PROPERTY' : o.paymentMode,
  maxGuests: String(o.maxGuests),
  isActive: o.isActive,
});

/**
 * One bookable option at a stay: a pool of beds with a price, who it's for,
 * and how the guest pays. Paid "in the app" goes through Razorpay after you
 * approve and counts towards the event's payout; "at the property" is
 * collected by your team and marked paid at check-in.
 */
export default function StayOptionEditorScreen() {
  const { eventId, stayId, optionId } = useLocalSearchParams<{ eventId: string; stayId: string; optionId: string }>();
  const isNew = optionId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('StayOptionEditor');

  useEffect(() => {
    if (isNew || !eventId || !stayId) return;
    void getTeamStay(eventId, stayId).then((r) => {
      const o = r.ok ? r.data.options.find((x) => x.id === optionId) : undefined;
      if (!o) return setError('This option no longer exists.');
      const d = toDraft(o);
      initial.current = JSON.stringify(d);
      setDraft(d);
    });
  }, [isNew, eventId, stayId, optionId]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const dirty = isNew || (draft !== null && JSON.stringify(draft) !== initial.current);

  const save = async () => {
    if (!draft || !eventId || !stayId) return;
    const beds = Number(draft.totalBeds);
    const price = Number(draft.price || 0);
    const maxGuests = Number(draft.maxGuests);
    if (!draft.name.trim()) return setError('Name this option, like "Dorm bed (boys)".');
    if (!Number.isInteger(beds) || beds < 1) return setError('How many beds? At least 1.');
    if (!(price >= 0)) return setError('Enter a price, or 0 for free.');
    if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 20) return setError('Guests per request has to be 1 to 20.');
    const body: StayOptionInput = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      gender: draft.gender,
      totalBeds: beds,
      price,
      pricing: draft.pricing,
      paymentMode: price > 0 ? draft.paymentMode : 'FREE',
      maxGuests,
      isActive: draft.isActive,
    };
    setSaving(true);
    const res = isNew ? await createStayOption(eventId, stayId, body) : await updateStayOption(eventId, stayId, optionId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${draft?.name}?`, 'Only options nobody has booked can be deleted. Switch it off otherwise.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteStayOption(eventId!, stayId!, optionId!);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const title = isNew ? 'New option' : 'Edit option';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const paid = Number(draft.price || 0) > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup plain>
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Dorm bed (boys)" />
          <FieldRow stacked multiline label="Description (optional)" value={draft.description} onChangeText={(v) => set({ description: v })} placeholder="6-bed room, shared bathroom" />
        </SettingsGroup>

        <SettingsGroup title="Beds" plain>
          <FieldRow label="Beds available" value={draft.totalBeds} onChangeText={(v) => set({ totalBeds: v })} keyboardType="number-pad" placeholder="40" />
          <FieldRow label="Guests per request" value={draft.maxGuests} onChangeText={(v) => set({ maxGuests: v })} keyboardType="number-pad" />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Beds are counted per night. More than 1 guest per request lets someone book for their team.
        </Text>

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>Who it's for</BlockTitle>
          <SegmentedTabs tabs={GENDERS} value={draft.gender} onChange={(g) => set({ gender: g })} />
        </View>

        <SettingsGroup title="Price" plain>
          <FieldRow label="Price (₹)" value={draft.price} onChangeText={(v) => set({ price: v })} keyboardType="decimal-pad" placeholder="0 for free" />
        </SettingsGroup>
        {paid ? (
          <>
            <View style={{ marginTop: spacing[4] }}>
              <SegmentedTabs tabs={PRICING} value={draft.pricing} onChange={(p) => set({ pricing: p })} />
            </View>
            <View style={{ marginTop: spacing[6] }}>
              <BlockTitle>Guests pay</BlockTitle>
              <SegmentedTabs tabs={PAYMENT} value={draft.paymentMode} onChange={(p) => set({ paymentMode: p })} />
            </View>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {draft.paymentMode === 'ONLINE'
                ? 'After you approve, the guest pays in the app (a processing fee is added). The money joins this event’s payout.'
                : 'Your team collects the money at the property and marks it paid before check-in.'}
            </Text>
          </>
        ) : (
          <Text style={[styles.note, { color: tokens.textMuted }]}>Free. Guests still need your approval.</Text>
        )}

        <SettingsGroup plain>
          <SwitchRow label="Taking bookings" hint="Switch off to stop new requests without losing existing ones." value={draft.isActive} onValueChange={(v) => set({ isActive: v })} />
        </SettingsGroup>

        {!isNew ? (
          <Button
            label="Delete option"
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? 'Add option' : 'Save changes'} onPress={save} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
