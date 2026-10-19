import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { IdentificationCard, Paperclip, Plus, X } from '@unifesto/unicon/react-native';
import CustomFieldInput from '../components/CustomFieldInput';
import DateTimeRow from '../components/manage/DateTimeRow';
import { BlockTitle } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { getProfile } from '../lib/api/profile';
import { buyerFee, getProcessingFeeTerms, NO_FEE } from '../lib/api/tickets';
import {
  addDays,
  dayLabel,
  estimate,
  fromDay,
  GENDER_LABELS,
  getEventStays,
  GUEST_GENDER_LABELS,
  priceLabel,
  requestStay,
  rupees,
  toCustomField,
  uploadStayFile,
  type GuestGender,
  type Stay,
  type StayOption,
} from '../lib/api/stays';
import { firstFormProblem, visibleFields, type FileAnswer } from '../utils/formQuestions';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const GENDERS: GuestGender[] = ['MALE', 'FEMALE', 'OTHER'];

interface GuestDraft {
  name: string;
  phone: string;
  email: string;
  gender: GuestGender | '';
  idProof: FileAnswer | null;
}

const blankGuest = (): GuestDraft => ({ name: '', phone: '', email: '', gender: '', idProof: null });

const toGender = (g: string | null | undefined): GuestGender | '' => {
  const s = (g ?? '').toUpperCase();
  return s === 'MALE' || s === 'FEMALE' || s === 'OTHER' ? s : '';
};

/**
 * Request a Unifesto Stay: nights, who's staying (with photo IDs), arrival,
 * an emergency contact and the stay's own questions. Nothing is charged here;
 * the event team approves first, and paid-online stays are paid after that.
 */
export default function StayBookingScreen() {
  const { eventId, stayId, optionId } = useLocalSearchParams<{ eventId: string; stayId: string; optionId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const { user } = useAuth();
  const [stay, setStay] = useState<Stay | null>(null);
  const [option, setOption] = useState<StayOption | null>(null);
  const [loadError, setLoadError] = useState('');
  const [feeTerms, setFeeTerms] = useState(NO_FEE);

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState<GuestDraft[]>([blankGuest()]);
  const [arrival, setArrival] = useState<Date | null>(null);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return;
    void getEventStays(eventId).then((r) => {
      if (!r.ok) return setLoadError(r.message);
      const s = r.data.stays.find((x) => x.id === stayId);
      const o = s?.options.find((x) => x.id === optionId);
      if (!s || !o) return setLoadError('This option is no longer available.');
      setStay(s);
      setOption(o);
      // Default to the whole window when the first night has room.
      const firstOpen = o.nights?.find((n) => n.left > 0)?.date ?? s.checkInFrom;
      setCheckIn(firstOpen);
      setCheckOut(addDays(firstOpen, 1));
    });
    void getProcessingFeeTerms().then(setFeeTerms);
    // Prefill the booker from the profile.
    void getProfile().then((p) => {
      setGuests((g) => {
        const [me, ...rest] = g;
        return [
          {
            ...me,
            name: me.name || p?.fullName || user?.fullName || '',
            phone: me.phone || p?.mobileNumber || user?.mobileNumber || '',
            email: me.email || p?.email || '',
            gender: me.gender || toGender(p?.gender),
          },
          ...rest,
        ];
      });
    });
  }, [eventId, stayId, optionId, user?.fullName, user?.mobileNumber]);

  const fields = useMemo(
    () => (stay && eventId ? stay.questions.map((q) => toCustomField(q, eventId, stay.id)) : []),
    [stay, eventId],
  );

  if (!stay || !option) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title: 'Book a stay' }} />
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const nightsMap = new Map((option.nights ?? []).map((n) => [n.date, n.left]));
  const checkInDays = (option.nights ?? []).map((n) => n.date);
  const checkOutDays: string[] = [];
  for (let d = addDays(checkIn || stay.checkInFrom, 1); d <= stay.checkOutUntil; d = addDays(d, 1)) checkOutDays.push(d);
  const nights = checkIn && checkOut ? Math.round((fromDay(checkOut).getTime() - fromDay(checkIn).getTime()) / 86400000) : 0;
  const base = estimate(option, guests.length, nights);
  // Each guest is one ticket for the fee cap, as on the server.
  const fee = option.paymentMode === 'ONLINE' ? buyerFee(base, feeTerms, guests.length) : 0;
  const fullNight = (() => {
    for (let d = checkIn; d && d < checkOut; d = addDays(d, 1)) if ((nightsMap.get(d) ?? 0) < guests.length) return d;
    return null;
  })();

  const setGuest = (i: number, patch: Partial<GuestDraft>) => {
    setError('');
    setGuests((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const pickCheckIn = (d: string) => {
    setError('');
    setCheckIn(d);
    if (!checkOut || checkOut <= d) setCheckOut(addDays(d, 1));
  };

  const submit = async () => {
    setError('');
    if (!checkIn || !checkOut || nights < 1) return setError('Pick your check-in and check-out days.');
    if (fullNight) return setError(`Not enough beds on the night of ${dayLabel(fullNight)}. Try other dates.`);
    for (const [i, g] of guests.entries()) {
      const who = i === 0 ? 'your' : `guest ${i + 1}'s`;
      if (!g.name.trim()) return setError(`Enter ${who} name.`);
      if (!g.gender) return setError(`Pick ${who} gender.`);
      if (option.gender !== 'ANY' && g.gender !== option.gender) {
        return setError(`${option.name} is ${GENDER_LABELS[option.gender].toLowerCase()}.`);
      }
      if (stay.requireIdProof && !g.idProof) return setError(`Add ${who} photo ID.`);
    }
    if (!guests[0].phone.trim()) return setError('Enter your phone number.');
    if (!arrival) return setError('Tell the team roughly when you will arrive.');
    if (!emergencyName.trim() || !emergencyPhone.trim()) return setError('Add an emergency contact.');
    const problem = firstFormProblem(fields, answers);
    if (problem) return setError(problem);

    setSubmitting(true);
    const res = await requestStay(stay.id, {
      optionId: option.id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      guests: guests.map((g) => ({
        name: g.name.trim(),
        phone: g.phone.trim() || undefined,
        email: g.email.trim() || undefined,
        gender: g.gender as GuestGender,
        idProof: g.idProof ?? undefined,
      })),
      arrivalAt: arrival.toISOString(),
      emergencyName: emergencyName.trim(),
      emergencyPhone: emergencyPhone.trim(),
      note: note.trim() || undefined,
      answers,
    });
    setSubmitting(false);
    if (!res.ok) return setError(res.message);
    AppAlert.alert('Request sent', "The event team will review it. You'll get a notification when they reply.");
    router.replace(`/stay/pass/${res.data.id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: 'Book a stay' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 60 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.kicker, { color: tokens.accent }]}>{stay.name.toUpperCase()}</Text>
        <Text style={[styles.title, { color: tokens.text }]}>{option.name}</Text>
        <Text style={[styles.muted, { color: tokens.textSecondary, textAlign: 'left' }]}>
          {[priceLabel(option), option.gender !== 'ANY' ? GENDER_LABELS[option.gender] : null].filter(Boolean).join(' · ')}
        </Text>

        {/* Nights */}
        <View style={styles.block}>
          <BlockTitle>Check in</BlockTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {checkInDays.map((d) => {
              const left = nightsMap.get(d) ?? 0;
              const on = d === checkIn;
              const full = left < guests.length;
              return (
                <DayChip key={d} day={d} on={on} sub={full ? 'Full' : `${left} left`} warn={full} onPress={() => pickCheckIn(d)} />
              );
            })}
          </ScrollView>
        </View>
        <View style={styles.block}>
          <BlockTitle>Check out</BlockTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {checkOutDays.map((d) => (
              <DayChip key={d} day={d} on={d === checkOut} onPress={() => setCheckOut(d)} />
            ))}
          </ScrollView>
          <Text style={[styles.hint, { color: fullNight ? tokens.danger : tokens.textMuted }]}>
            {fullNight
              ? `Not enough beds on the night of ${dayLabel(fullNight)}.`
              : `${nights} night${nights === 1 ? '' : 's'}${stay.checkInTime ? ` · check-in from ${stay.checkInTime}` : ''}${stay.checkOutTime ? ` · check-out by ${stay.checkOutTime}` : ''}`}
          </Text>
        </View>

        {/* Guests */}
        {guests.map((g, i) => (
          <SettingsGroup
            key={i}
            title={i === 0 ? 'You' : `Guest ${i + 1}`}
            plain
            action={i > 0 ? { label: 'Remove', onPress: () => setGuests((all) => all.filter((_, j) => j !== i)) } : undefined}
          >
            <Input label="Full name (as on ID)" value={g.name} onChangeText={(v) => setGuest(i, { name: v })} autoCapitalize="words" />
            <Input
              label={i === 0 ? 'Phone' : 'Phone (optional)'}
              value={g.phone}
              onChangeText={(v) => setGuest(i, { phone: v })}
              keyboardType="phone-pad"
            />
            <Input
              label="Email (optional)"
              value={g.email}
              onChangeText={(v) => setGuest(i, { email: v })}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.inner}>
              <Text style={[styles.caption, { color: tokens.textMuted }]}>Gender</Text>
              <View style={styles.genderRow}>
                {GENDERS.map((x) => {
                  const on = g.gender === x;
                  return (
                    <Pressable
                      key={x}
                      onPress={() => setGuest(i, { gender: x })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      style={[styles.genderChip, { backgroundColor: on ? tokens.accent : tokens.fill }]}
                    >
                      <Text style={[styles.genderText, { color: on ? tokens.accentFg : tokens.text }]}>{GUEST_GENDER_LABELS[x]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <IdProofPicker
              stayId={stay.id}
              value={g.idProof}
              required={stay.requireIdProof}
              onChange={(f) => setGuest(i, { idProof: f })}
            />
          </SettingsGroup>
        ))}
        {guests.length < option.maxGuests ? (
          <Button
            label="Add a teammate"
            variant="secondary"
            fullWidth
            icon={<Plus size={18} color={tokens.text} weight="bold" />}
            onPress={() => setGuests((g) => [...g, blankGuest()])}
            style={{ marginTop: spacing[4] }}
          />
        ) : null}

        {/* Arrival & emergency */}
        <SettingsGroup title="Arrival" plain>
          {arrival ? (
            <DateTimeRow label="Expected arrival" value={arrival} onChange={setArrival} />
          ) : (
            <SettingsRow
              label="Set arrival time"
              onPress={() => {
                const d = fromDay(checkIn || stay.checkInFrom);
                d.setHours(12, 0, 0, 0);
                setArrival(d);
              }}
            />
          )}
        </SettingsGroup>
        <SettingsGroup title="Emergency contact" plain>
          <Input label="Name" value={emergencyName} onChangeText={setEmergencyName} autoCapitalize="words" />
          <Input label="Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" />
        </SettingsGroup>

        {/* The stay's own questions */}
        {fields.length ? (
          <View style={styles.block}>
            <BlockTitle>A few more details</BlockTitle>
            {visibleFields(fields, answers).map((f) => (
              <CustomFieldInput key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
            ))}
          </View>
        ) : null}

        <SettingsGroup title="Note for the team (optional)" plain>
          <Input label="Anything they should know" value={note} onChangeText={setNote} multiline />
        </SettingsGroup>

        {/* Summary */}
        <SettingsGroup title="Summary" plain>
          <SettingsRow label="Nights" value={`${nights} × ${guests.length} guest${guests.length === 1 ? '' : 's'}`} />
          <SettingsRow label="Stay" value={base ? rupees(base) : 'Free'} />
          {fee ? <SettingsRow label="Processing fee" value={rupees(fee)} /> : null}
          {base ? <SettingsRow label="Total" value={rupees(base + fee)} /> : null}
        </SettingsGroup>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          {!base
            ? 'Free. The event team confirms your bed.'
            : option.paymentMode === 'ONLINE'
              ? "You pay in the app after the event team approves. You won't be charged now."
              : 'You pay at the property when you check in.'}
        </Text>

        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
        <Button
          label="Send request"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={() => void submit()}
          style={{ marginTop: spacing[5] }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DayChip({ day, on, sub, warn, onPress }: { day: string; on: boolean; sub?: string; warn?: boolean; onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}${sub ? `, ${sub}` : ''}`}
      style={[styles.day, { backgroundColor: on ? tokens.accent : tokens.fill }]}
    >
      <Text style={[styles.dayWeek, { color: on ? tokens.accentFg : tokens.textMuted }]}>{dayLabel(day, { weekday: 'short' })}</Text>
      <Text style={[styles.dayNum, { color: on ? tokens.accentFg : tokens.text }]}>{dayLabel(day, { day: 'numeric' })}</Text>
      <Text style={[styles.dayWeek, { color: on ? tokens.accentFg : tokens.textMuted }]}>{dayLabel(day, { month: 'short' })}</Text>
      {sub ? <Text style={[styles.daySub, { color: on ? tokens.accentFg : warn ? tokens.danger : tokens.textMuted }]}>{sub}</Text> : null}
    </Pressable>
  );
}

function Input({
  label,
  multiline,
  ...rest
}: { label: string } & Omit<React.ComponentProps<typeof TextInput>, 'style' | 'placeholder'>) {
  const tokens = useTokens();
  return (
    <View style={styles.inner}>
      <Text style={[styles.caption, { color: tokens.textMuted }]}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={tokens.textMuted}
        selectionColor={tokens.accent}
        style={[styles.input, multiline && { minHeight: 64, textAlignVertical: 'top' }, { color: tokens.text }]}
      />
    </View>
  );
}

/** Pick a photo of an ID (or a PDF) and upload it privately to the stay. */
function IdProofPicker({
  stayId,
  value,
  required,
  onChange,
}: {
  stayId: string;
  value: FileAnswer | null;
  required: boolean;
  onChange: (f: FileAnswer | null) => void;
}) {
  const tokens = useTokens();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async () => {
    setErr('');
    const res = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > 5 * 1024 * 1024) return setErr('Files can be up to 5 MB.');
    setBusy(true);
    try {
      onChange(await uploadStayFile(stayId, { uri: a.uri, name: a.name, mimeType: a.mimeType }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload the file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.inner}>
      <Text style={[styles.caption, { color: tokens.textMuted }]}>Photo ID{required ? '' : ' (optional)'}</Text>
      {value ? (
        <View style={[styles.file, { backgroundColor: tokens.fill }]}>
          <Paperclip size={18} color={tokens.accent} />
          <Text style={[styles.fileName, { color: tokens.text }]} numberOfLines={1}>
            {value.name}
          </Text>
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="Remove ID">
            <X size={18} color={tokens.textMuted} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => void pick()}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.file, { backgroundColor: tokens.fill, opacity: pressed ? 0.85 : 1 }]}
        >
          {busy ? <ActivityIndicator color={tokens.accent} /> : <IdentificationCard size={20} color={tokens.accent} />}
          <Text style={[styles.fileName, { color: tokens.accent }]}>{busy ? 'Uploading…' : 'Upload college or government ID'}</Text>
        </Pressable>
      )}
      {err ? <Text style={[styles.hint, { color: tokens.danger }]}>{err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  kicker: { fontSize: typography.fontSize.xs, letterSpacing: 1.2, ...font('semibold') },
  title: { marginTop: spacing[1], marginBottom: spacing[1], fontSize: typography.fontSize['2xl'], ...font('heading') },
  block: { marginTop: spacing[6] },
  dayRow: { gap: spacing[2], paddingRight: spacing[4] },
  day: { width: 64, paddingVertical: spacing[2], borderRadius: borderRadius.lg, alignItems: 'center', gap: 1 },
  dayWeek: { fontSize: typography.fontSize.xs, ...font('medium') },
  dayNum: { fontSize: typography.fontSize.xl, ...font('heading') },
  daySub: { marginTop: 2, fontSize: 10, ...font('semibold') },
  hint: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  inner: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[2] },
  caption: { fontSize: typography.fontSize.xs, ...font('medium') },
  input: { fontSize: typography.fontSize.base, paddingTop: spacing[1], paddingBottom: spacing[2], ...font('medium') },
  genderRow: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  genderChip: { flex: 1, alignItems: 'center', paddingVertical: spacing[2], borderRadius: borderRadius.full },
  genderText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  file: {
    marginTop: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  fileName: { flex: 1, fontSize: typography.fontSize.sm, ...font('semibold') },
  error: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...font('medium') },
});
