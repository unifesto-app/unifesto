import { isEmail } from '../lib/constants';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowCounterClockwise, ArrowsLeftRight, Check, EnvelopeSimple, PencilSimple, Phone, Receipt, XCircle } from '@unifesto/unicon/react-native';
import { Avatar } from '../components/checkin/PersonRow';
import { CardBackdrop } from '../components/ui/CardSurface';
import { getAttendee, releaseGroupSeat, reopenGroupSeat, restoreAttendee, type AttendeeDetail, type GroupSeatRow } from '../lib/api/manageEvent';
import { attendeeBadge } from '../components/manage/AttendeeRow';
import SeatRow, { seatPerson } from '../components/manage/SeatRow';
import { displayFieldValue } from '../hooks/useEventRegistration';
import { getEventCustomFields, openFormUpload, type CustomField } from '../lib/api/tickets';
import { displayAnswer, isFileAnswer } from '../utils/formQuestions';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { FieldRow } from '../components/manage/FormFields';
import { addSeatsAsCurator, makeLeadAsCurator, removeSeatAsCurator, replaceMemberAsCurator } from '../lib/api/attendeeControls';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const AVATAR = 72;
const ICON = 24;

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    : undefined;

const money = (amount: number | string | undefined, currency = 'INR') => {
  const n = Number(amount ?? 0);
  if (!n) return 'Free';
  return `${currency === 'INR' ? '₹' : `${currency} `}${n.toLocaleString('en-IN')}`;
};


/**
 * One registration, operator view: who, what they bought, check-ins, group
 * seats (release / reopen), and the actions: cancel or refund, transfer, restore.
 */
export default function AttendeeDetailScreen() {
  const { eventId, registrationId } = useLocalSearchParams<{ eventId: string; registrationId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [seatBusy, setSeatBusy] = useState<number | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  // Replacing a member: which seat, and who (optionally) takes it over.
  const [replacing, setReplacing] = useState<{ seatIndex: number; name: string } | null>(null);
  const [replaceEmail, setReplaceEmail] = useState('');

  // Question labels, so answers read "College: IIT" instead of a field id.
  useEffect(() => {
    if (eventId) void getEventCustomFields(eventId).then((r) => setFields(r.fields)).catch(() => {});
  }, [eventId]);

  const [reg, setReg] = useState<AttendeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    if (!eventId || !registrationId) return;
    const res = await getAttendee(eventId, registrationId);
    if (res.ok) {
      setReg(res.data);
      setError('');
    } else {
      setError(res.denied ? 'Only Space admins can open attendee details right now.' : res.message);
    }
    setLoading(false);
  }, [eventId, registrationId]);

  // Reload on focus, so a cancel / refund / transfer made on the next screen shows.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const seatAction = (seatIndex: number, release: boolean) =>
    AppAlert.alert(
      release ? 'Release this seat?' : 'Reopen this seat?',
      release
        ? 'It stops waiting for someone to claim it. The group keeps its size and nothing is refunded. You can reopen it later.'
        : 'It goes back to open so the group lead can fill it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: release ? 'Release' : 'Reopen',
          onPress: async () => {
            setSeatBusy(seatIndex);
            const res = release
              ? await releaseGroupSeat(eventId!, registrationId!, seatIndex)
              : await reopenGroupSeat(eventId!, registrationId!, seatIndex);
            setSeatBusy(null);
            if (!res.ok) {
              AppAlert.alert("Couldn't update the seat", res.message);
              return;
            }
            await load();
          },
        },
      ],
    );

  /** Run one seat change, then refresh. */
  const seatCall = async (seatIndex: number, fn: () => Promise<{ ok: boolean; message?: string }>, failTitle: string) => {
    setSeatBusy(seatIndex);
    const res = await fn();
    setSeatBusy(null);
    if (!res.ok) AppAlert.alert(failTitle, (res as { message?: string }).message ?? 'Please try again.');
    await load();
  };

  const confirmRemove = (seatIndex: number, name: string) =>
    AppAlert.alert(
      `Remove ${name} from the group?`,
      'The group gets one smaller and the seat goes back on sale. Nothing is refunded. A member who is removed loses their ticket and is told by email.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void seatCall(seatIndex, () => removeSeatAsCurator(eventId!, registrationId!, seatIndex), "Couldn't remove"),
        },
      ],
    );

  const confirmMakeLead = (seatIndex: number, name: string) =>
    AppAlert.alert(
      `Make ${name} the group lead?`,
      'They manage the group and its booking from now on, including refunds. The current lead becomes a member. Both are told.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make lead',
          onPress: () => void seatCall(seatIndex, () => makeLeadAsCurator(eventId!, registrationId!, seatIndex), "Couldn't change the lead"),
        },
      ],
    );

  /** Every change a curator can make to one seat, by its state. */
  const seatMenu = (s: GroupSeatRow) => {
    const name = seatPerson(s).name || `Seat ${s.seatIndex}`;
    const opts: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (s.status === 'OPEN' || s.status === 'INVITED') opts.push({ text: 'Release seat', onPress: () => seatAction(s.seatIndex, true) });
    if (s.status === 'RELEASED') opts.push({ text: 'Reopen seat', onPress: () => seatAction(s.seatIndex, false) });
    if (s.status === 'CLAIMED') {
      if (s.claimedBy) opts.push({ text: 'Make group lead', onPress: () => confirmMakeLead(s.seatIndex, name) });
      opts.push({
        text: 'Replace member',
        onPress: () => {
          setReplaceEmail('');
          setReplacing({ seatIndex: s.seatIndex, name });
        },
      });
    }
    opts.push({ text: 'Remove from group', style: 'destructive', onPress: () => confirmRemove(s.seatIndex, name) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    AppAlert.alert(name, undefined, opts);
  };

  const addSeat = () =>
    AppAlert.alert('Add a seat to this group?', 'The group gets one bigger and the lead can invite someone. Nothing is charged in the app; collect any payment yourself.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add seat', onPress: () => void seatCall(0, () => addSeatsAsCurator(eventId!, registrationId!, 1), "Couldn't add a seat") },
    ]);

  const openAction = (kind: 'cancel' | 'refund' | 'transfer') =>
    router.push({ pathname: `/manage/event/${eventId}/attendee-action`, params: { registrationId, kind } });

  const doReplace = async (email?: string) => {
    if (!replacing) return;
    if (email && !isEmail(email)) {
      AppAlert.alert('Check the email', 'That doesn’t look like an email address.');
      return;
    }
    setSeatBusy(replacing.seatIndex);
    const res = await replaceMemberAsCurator(eventId!, registrationId!, replacing.seatIndex, email);
    setSeatBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't replace", res.message);
      return;
    }
    setReplacing(null);
    setReplaceEmail('');
    await load();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmRestore = () =>
    AppAlert.alert(
      'Restore this registration?',
      'Their seat and tickets come back. Nothing is charged or refunded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(true);
            const res = await restoreAttendee(eventId!, registrationId!);
            setRestoring(false);
            if (!res.ok) {
              AppAlert.alert("Couldn't restore", res.message);
              return;
            }
            await load();
          },
        },
      ],
    );

  if (loading) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  if (error || !reg) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.muted, { color: c.soft, textAlign: 'center' }]}>{error || 'Not found'}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
        </View>
      </CosmosScreen>
    );
  }

  const badge = attendeeBadge(reg, c);
  const name = reg.user.fullName || reg.user.username || 'Attendee';
  const icon = (I: typeof Phone) => <I size={ICON} color={c.text} />;
  const seats = reg.groupSeats ?? [];
  const cancelled = reg.status === 'CANCELLED';
  const answers = Object.entries(reg.formResponses ?? {})
    .map(([id, v]) => {
      const f = fields.find((x) => x.id === id);
      return {
        id,
        label: f?.label ?? 'Answer',
        value: f ? displayFieldValue(f, v) : displayAnswer(undefined, v),
        file: isFileAnswer(v) ? v : null,
      };
    })
    .filter((a) => a.value !== '');
  // Money moved → it has to leave through a refund, not a plain cancel.
  const paid = Number(reg.totalAmount) > 0 && (reg.paymentStatus === 'PAID' || reg.paymentStatus === 'PARTIALLY_REFUNDED');

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Avatar name={name} url={reg.user.avatarUrl} size={AVATAR} />
        </View>
        <Text style={[styles.name, { color: c.text }]} accessibilityRole="header">{name}</Text>
        {reg.user.username ? <Text style={[styles.muted, { color: c.muted }]}>@{reg.user.username}</Text> : null}
        <View style={styles.badge}>
          {badge.color === c.success ? (
            <Check size={13} color={badge.color} weight="bold" />
          ) : (
            <View style={[styles.dot, { backgroundColor: badge.color }]} />
          )}
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
        </View>
      </View>

      {reg.user.mobileNumber || reg.user.email ? (
        <SettingsGroup title="Contact">
          {reg.user.mobileNumber ? (
            <SettingsRow icon={icon(Phone)} label={reg.user.mobileNumber} external onPress={() => Linking.openURL(`tel:${reg.user.mobileNumber}`)} />
          ) : null}
          {reg.user.email ? (
            <SettingsRow icon={icon(EnvelopeSimple)} label={reg.user.email} external onPress={() => Linking.openURL(`mailto:${reg.user.email}`)} />
          ) : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Booking" plain>
        <SettingsRow label="Ticket" value={reg.ticketType?.name ?? 'None'} />
        {reg.groupSize && reg.groupSize > 1 ? <SettingsRow label="Group size" value={String(reg.groupSize)} /> : null}
        <SettingsRow label="Paid" value={money(reg.totalAmount, reg.ticketType?.currency)} />
        <SettingsRow label="Registered" value={when(reg.registeredAt)} />
        {reg.cancelledAt ? <SettingsRow label="Cancelled" value={when(reg.cancelledAt)} /> : null}
      </SettingsGroup>

      {reg.cancellationReason ? (
        <Text style={[styles.reason, { color: c.soft }]}>“{reg.cancellationReason}”</Text>
      ) : null}

      {reg.checkinRecords && reg.checkinRecords.length > 0 ? (
        <SettingsGroup title="Check-ins" plain>
          {reg.checkinRecords.map((c, i) => (
            <SettingsRow
              key={`${c.checkedInAt}-${i}`}
              label={c.checkinType?.name ?? 'Entry'}
              value={[when(c.checkedInAt), c.checkedInByUser?.fullName || c.checkedInByUser?.username].filter(Boolean).join(' · ')}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {answers.length > 0 ? (
        <SettingsGroup title={seats.length > 0 ? 'Team answers' : 'Answers'} plain>
          {answers.map((a) => (
            <View key={a.id} style={styles.answer}>
              <Text style={[styles.answerLabel, { color: c.muted }]}>{a.label}</Text>
              {a.file ? (
                <Text
                  style={[styles.answerValue, { color: c.primary }]}
                  onPress={() => void openFormUpload(eventId, a.file!.key)}
                  accessibilityRole="link"
                >
                  {a.value}
                </Text>
              ) : (
                <Text style={[styles.answerValue, { color: c.text }]} selectable>
                  {a.value}
                </Text>
              )}
            </View>
          ))}
        </SettingsGroup>
      ) : null}

      {seats.length > 0 ? (
        <SettingsGroup
          title={`Group seats · ${seats.filter((x) => x.status === 'CLAIMED').length} of ${seats.length} filled`}
          action={cancelled ? undefined : { label: seatBusy === 0 ? 'Adding…' : 'Add seat', onPress: addSeat }}
          plain
        >
          {seats.map((s) => (
            // Seat 1 is the lead's; every other seat can change until the group is cancelled.
            <SeatRow
              key={s.seatIndex}
              seat={s}
              fields={fields}
              action={cancelled || s.seatIndex === 1 ? undefined : 'manage'}
              busy={seatBusy === s.seatIndex}
              onAction={() => seatMenu(s)}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {replacing ? (
        <>
          <SettingsGroup
            title={`Replace ${replacing.name}`}
            action={{ label: 'Cancel', onPress: () => setReplacing(null) }}
            plain
          >
            <FieldRow
              label="New person"
              value={replaceEmail}
              onChangeText={setReplaceEmail}
              placeholder="Their email (optional)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </SettingsGroup>
          <Text style={[styles.muted, { color: c.muted, marginTop: spacing[2], marginHorizontal: spacing[1] }]}>
            {replacing.name} loses the seat and their ticket stops working; they're told by email. With an email, the new person gets
            a link to claim it; without one the seat is left open for the lead to fill. Not possible once they've checked in.
          </Text>
          <Button
            label={replaceEmail.trim() ? 'Replace and invite' : 'Remove and leave seat open'}
            variant="danger"
            fullWidth
            loading={seatBusy === replacing.seatIndex}
            onPress={() => void doReplace(replaceEmail.trim().toLowerCase() || undefined)}
            style={{ marginTop: spacing[4], marginBottom: spacing[4] }}
          />
        </>
      ) : null}

      {!cancelled ? (
        <SettingsGroup title="Actions">
          <SettingsRow
            icon={<PencilSimple size={ICON} color={c.text} />}
            label="Edit details"
            onPress={() => router.push({ pathname: '/edit-details', params: { registrationId: registrationId!, eventId: eventId!, title: name } })}
          />
          <SettingsRow
            icon={<ArrowsLeftRight size={ICON} color={c.text} />}
            label="Transfer to someone else"
            onPress={() => openAction('transfer')}
          />
          {paid ? (
            <SettingsRow
              icon={<Receipt size={ICON} color={c.danger} weight="fill" />}
              label="Refund and cancel"
              danger
              onPress={() => openAction('refund')}
            />
          ) : (
            <SettingsRow
              icon={<XCircle size={ICON} color={c.danger} weight="fill" />}
              label="Cancel registration"
              danger
              onPress={() => openAction('cancel')}
            />
          )}
        </SettingsGroup>
      ) : null}

      {/* The detail endpoint is Space-admin only, and Space admins may restore,
          so anyone who can see this can restore; the server re-checks anyway. */}
      {reg.status === 'CANCELLED' ? (
        <Button
          label={restoring ? 'Restoring…' : 'Restore registration'}
          variant="secondary"
          size="lg"
          fullWidth
          disabled={restoring}
          icon={<ArrowCounterClockwise size={18} color={c.text} weight="bold" />}
          onPress={confirmRestore}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  hero: { alignItems: 'center', gap: 4, marginBottom: spacing[6] },
  avatar: { marginBottom: spacing[2] },
  // A person's name: Hanken, never display.
  name: { fontSize: typography.fontSize['2xl'], lineHeight: 30, textAlign: 'center', ...cosmosFont.strong },
  // The status is plain text, never a pill.
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginTop: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 2 },
  badgeText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  muted: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  answer: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 2 },
  answerLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  answerValue: { fontSize: typography.fontSize.base, ...cosmosFont.body },
  reason: { marginTop: -spacing[2], marginBottom: spacing[4], paddingHorizontal: spacing[2], fontSize: typography.fontSize.sm, fontStyle: 'italic', ...cosmosFont.body },
});
