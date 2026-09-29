import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Question, Trash } from 'phosphor-react-native';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import ChipPicker from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getManagedEvent } from '../lib/api/eventAdmin';
import {
  createStay,
  deleteStay,
  fromDay,
  GENDER_LABELS,
  getTeamStay,
  PAYMENT_LABELS,
  priceLabel,
  PROPERTY_LABELS,
  toDay,
  updateStay,
  uploadStayCover,
  type Stay,
  type StayInput,
  type StayPropertyType,
} from '../lib/api/stays';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const TYPES = (Object.keys(PROPERTY_LABELS) as StayPropertyType[]).map((k) => ({ value: k, label: PROPERTY_LABELS[k] }));

interface Draft {
  name: string;
  propertyType: StayPropertyType;
  description: string;
  address: string;
  city: string;
  mapUrl: string;
  amenities: string;
  houseRules: string;
  contactName: string;
  contactPhone: string;
  checkInFrom: Date;
  checkOutUntil: Date;
  checkInTime: string;
  checkOutTime: string;
  requireIdProof: boolean;
  paymentWindowHours: string;
  isPublished: boolean;
}

const toDraft = (s: Stay): Draft => ({
  name: s.name,
  propertyType: s.propertyType,
  description: s.description ?? '',
  address: s.address ?? '',
  city: s.city ?? '',
  mapUrl: s.mapUrl ?? '',
  amenities: s.amenities.join(', '),
  houseRules: s.houseRules ?? '',
  contactName: s.contactName ?? '',
  contactPhone: s.contactPhone ?? '',
  checkInFrom: fromDay(s.checkInFrom),
  checkOutUntil: fromDay(s.checkOutUntil),
  checkInTime: s.checkInTime ?? '',
  checkOutTime: s.checkOutTime ?? '',
  requireIdProof: s.requireIdProof,
  paymentWindowHours: String(s.paymentWindowHours),
  isPublished: s.isPublished,
});

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Create or edit one Unifesto Stay: the property, when guests can stay, what
 * can be booked (options) and what to ask (questions). A new stay is saved
 * first, then options and questions are added to it.
 */
export default function StayEditorScreen() {
  const { eventId, stayId } = useLocalSearchParams<{ eventId: string; stayId: string }>();
  const isNew = stayId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [stay, setStay] = useState<Stay | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('StayEditor');

  // A new stay defaults to the event's own dates (night before check-out day).
  useEffect(() => {
    if (!isNew || !eventId) return;
    void getManagedEvent(eventId).then((r) => {
      const start = r.ok ? new Date(r.data.startDateTime) : new Date();
      const end = r.ok ? new Date(r.data.endDateTime) : new Date(Date.now() + 86400000);
      const out = midnight(end);
      out.setDate(out.getDate() + 1);
      setDraft({
        name: '',
        propertyType: 'HOSTEL',
        description: '',
        address: '',
        city: '',
        mapUrl: '',
        amenities: '',
        houseRules: '',
        contactName: '',
        contactPhone: '',
        checkInFrom: midnight(start),
        checkOutUntil: out,
        checkInTime: '12:00 PM',
        checkOutTime: '10:00 AM',
        requireIdProof: true,
        paymentWindowHours: '48',
        isPublished: false,
      });
    });
  }, [isNew, eventId]);

  const load = useCallback(async () => {
    if (isNew || !eventId || !stayId) return;
    const r = await getTeamStay(eventId, stayId);
    if (!r.ok) return setError(r.message);
    setStay(r.data);
    // Keep unsaved edits when coming back from the option / question editors.
    setDraft((d) => {
      const fresh = toDraft(r.data);
      if (d && JSON.stringify(d) !== initial.current) return d;
      initial.current = JSON.stringify(fresh);
      return fresh;
    });
  }, [isNew, eventId, stayId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const dirty = isNew || (draft !== null && JSON.stringify(draft) !== initial.current);

  const save = async () => {
    if (!draft || !eventId) return;
    if (!draft.name.trim()) return setError('Give the stay a name.');
    if (draft.checkOutUntil <= draft.checkInFrom) return setError('The last check-out day has to be after the first check-in day.');
    const hours = Number(draft.paymentWindowHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 240) return setError('Time to pay has to be 1 to 240 hours.');
    const body: StayInput = {
      name: draft.name.trim(),
      propertyType: draft.propertyType,
      description: draft.description.trim() || null,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      mapUrl: draft.mapUrl.trim() || null,
      amenities: draft.amenities
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      houseRules: draft.houseRules.trim() || null,
      contactName: draft.contactName.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      checkInFrom: toDay(draft.checkInFrom),
      checkOutUntil: toDay(draft.checkOutUntil),
      checkInTime: draft.checkInTime.trim() || null,
      checkOutTime: draft.checkOutTime.trim() || null,
      requireIdProof: draft.requireIdProof,
      paymentWindowHours: hours,
      ...(isNew ? {} : { isPublished: draft.isPublished }),
    };
    setSaving(true);
    const res = isNew ? await createStay(eventId, body) : await updateStay(eventId, stayId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    if (isNew) {
      // Stay on the new stay so options can be added straight away.
      router.replace({ pathname: `/manage/event/${eventId}/stay`, params: { stayId: res.data.id } });
      return;
    }
    const fresh = toDraft(res.data);
    initial.current = JSON.stringify(fresh);
    setStay(res.data);
    setDraft(fresh);
  };

  const pickCover = async () => {
    if (!stay || !eventId) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (picked.canceled || !picked.assets?.[0]) return;
    setUploading(true);
    const res = await uploadStayCover(eventId, stay.id, picked.assets[0].uri);
    setUploading(false);
    if (!res.ok) return AppAlert.alert("Couldn't upload", res.message);
    setStay({ ...stay, coverImageUrl: res.data.coverImageUrl });
  };

  const remove = () =>
    AppAlert.alert(`Delete ${stay?.name}?`, 'Its options and questions go too. A stay with bookings can only be hidden.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteStay(eventId!, stayId!);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const title = isNew ? 'New stay' : 'Edit stay';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const openOption = (optionId: string) =>
    router.push({ pathname: `/manage/event/${eventId}/stay-option`, params: { stayId: stay!.id, optionId } });
  const openQuestion = (fieldId: string) =>
    router.push({ pathname: `/manage/event/${eventId}/ticket-question`, params: { stayId: stay!.id, fieldId } });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {stay ? (
          <Pressable
            onPress={() => void pickCover()}
            accessibilityRole="button"
            accessibilityLabel="Change cover photo"
            style={[styles.cover, { backgroundColor: tokens.fill }]}
          >
            {stay.coverImageUrl ? <Image source={{ uri: stay.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={[styles.coverBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              {uploading ? <ActivityIndicator color="#ffffff" /> : <Camera size={18} color="#ffffff" />}
              <Text style={styles.coverText}>{stay.coverImageUrl ? 'Change photo' : 'Add a photo'}</Text>
            </View>
          </Pressable>
        ) : null}

        <SettingsGroup plain>
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Boys Hostel, Block C" />
          <FieldRow
            stacked
            multiline
            label="About (optional)"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="Walking distance from the venue, shared rooms…"
          />
        </SettingsGroup>

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>Type</BlockTitle>
          <ChipPicker options={TYPES} value={draft.propertyType} onChange={(v) => v && set({ propertyType: v })} />
        </View>

        <SettingsGroup title="Where" plain>
          <FieldRow stacked label="Address" value={draft.address} onChangeText={(v) => set({ address: v })} multiline />
          <FieldRow label="City" value={draft.city} onChangeText={(v) => set({ city: v })} placeholder="Hyderabad" />
          <FieldRow
            stacked
            label="Map link (optional)"
            value={draft.mapUrl}
            onChangeText={(v) => set({ mapUrl: v })}
            placeholder="https://maps.app.goo.gl/…"
            autoCapitalize="none"
            keyboardType="url"
          />
        </SettingsGroup>

        <SettingsGroup title="When" plain>
          <DateTimeRow mode="date" label="First check-in" value={draft.checkInFrom} onChange={(d) => set({ checkInFrom: midnight(d) })} />
          <DateTimeRow
            mode="date"
            label="Last check-out"
            value={draft.checkOutUntil}
            minimumDate={draft.checkInFrom}
            onChange={(d) => set({ checkOutUntil: midnight(d) })}
          />
          <FieldRow label="Check-in time" value={draft.checkInTime} onChangeText={(v) => set({ checkInTime: v })} placeholder="12:00 PM" />
          <FieldRow label="Check-out time" value={draft.checkOutTime} onChangeText={(v) => set({ checkOutTime: v })} placeholder="10:00 AM" />
        </SettingsGroup>

        <SettingsGroup title="Details for guests" plain>
          <FieldRow
            stacked
            label="Amenities, separated by commas"
            value={draft.amenities}
            onChangeText={(v) => set({ amenities: v })}
            placeholder="Wi-Fi, Hot water, Mess, Lockers"
          />
          <FieldRow stacked multiline label="House rules (optional)" value={draft.houseRules} onChangeText={(v) => set({ houseRules: v })} />
          <FieldRow stacked label="Contact name (optional)" value={draft.contactName} onChangeText={(v) => set({ contactName: v })} />
          <FieldRow label="Contact phone" value={draft.contactPhone} onChangeText={(v) => set({ contactPhone: v })} keyboardType="phone-pad" placeholder="Optional" />
        </SettingsGroup>

        <SettingsGroup title="Booking" plain>
          <SwitchRow
            label="Ask every guest for a photo ID"
            hint="College or government ID, uploaded privately. Only your team can open it."
            value={draft.requireIdProof}
            onValueChange={(v) => set({ requireIdProof: v })}
          />
          <FieldRow
            label="Hours to pay after approval"
            value={draft.paymentWindowHours}
            onChangeText={(v) => set({ paymentWindowHours: v })}
            keyboardType="number-pad"
          />
          {!isNew ? (
            <SwitchRow
              label="Published"
              hint="Registered attendees can see and request this stay."
              value={draft.isPublished}
              onValueChange={(v) => set({ isPublished: v })}
            />
          ) : null}
        </SettingsGroup>

        {stay ? (
          <>
            <SettingsGroup title="Rooms and beds" action={{ label: 'Add', onPress: () => openOption('new') }}>
              {stay.options.length === 0 ? <SettingsRow label="Add what guests can book" onPress={() => openOption('new')} /> : null}
              {stay.options.map((o) => (
                <View key={o.id}>
                  <SettingsRow label={o.name} value={o.isActive ? priceLabel(o) : 'Off'} onPress={() => openOption(o.id)} />
                  <Text style={[styles.sub, { color: tokens.textMuted }]} onPress={() => openOption(o.id)}>
                    {o.totalBeds} beds · {o.bedsLeft ?? o.totalBeds} free on the busiest night · {GENDER_LABELS[o.gender]}
                    {o.price ? ` · ${PAYMENT_LABELS[o.paymentMode]}` : ''}
                  </Text>
                </View>
              ))}
            </SettingsGroup>

            <SettingsGroup title="Questions" action={{ label: 'Add', onPress: () => openQuestion('new') }}>
              {stay.questions.length === 0 ? (
                <SettingsRow
                  icon={<Question size={22} color={tokens.textMuted} />}
                  label="Ask something extra (optional)"
                  onPress={() => openQuestion('new')}
                />
              ) : null}
              {stay.questions.map((q) => (
                <SettingsRow key={q.id} label={q.label} value={q.isRequired ? 'Required' : undefined} onPress={() => openQuestion(q.id)} />
              ))}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Name, phone, gender, arrival time and an emergency contact are always asked.
            </Text>

            <Button
              label="Delete stay"
              variant="danger"
              size="lg"
              fullWidth
              loading={deleting}
              disabled={saving}
              icon={<Trash size={18} color={tokens.danger} weight="bold" />}
              onPress={remove}
              style={{ marginTop: spacing[10] }}
            />
          </>
        ) : (
          <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[4] }]}>
            Create the stay, then add its rooms and beds. It stays hidden until you publish it.
          </Text>
        )}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? 'Create stay' : 'Save changes'} onPress={save} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: borderRadius.xl, overflow: 'hidden', justifyContent: 'flex-end', marginBottom: spacing[5] },
  coverBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    margin: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  coverText: { color: '#ffffff', fontSize: typography.fontSize.sm, ...font('semibold') },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
