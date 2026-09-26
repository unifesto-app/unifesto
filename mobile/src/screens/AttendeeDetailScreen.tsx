import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowCounterClockwise, ArrowsLeftRight, EnvelopeSimple, Phone, Receipt, User, XCircle } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getAttendee, releaseGroupSeat, reopenGroupSeat, restoreAttendee, type AttendeeDetail } from '../lib/api/manageEvent';
import { attendeeBadge } from '../components/manage/AttendeeRow';
import SeatRow from '../components/manage/SeatRow';
import { displayFieldValue } from '../hooks/useEventRegistration';
import { getEventCustomFields, type CustomField } from '../lib/api/tickets';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
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
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [seatBusy, setSeatBusy] = useState<number | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);

  // Question labels, so answers read "College: IIT" instead of a field id.
  useEffect(() => {
    if (eventId) void getEventCustomFields(eventId).then((r) => setFields(r.fields)).catch(() => {});
  }, [eventId]);

  const [reg, setReg] = useState<AttendeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);

  useAnalyticsScreenTracking('AttendeeDetail');

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

  const openAction = (kind: 'cancel' | 'refund' | 'transfer') =>
    router.push({ pathname: `/manage/event/${eventId}/attendee-action`, params: { registrationId, kind } });

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
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (error || !reg) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>{error || 'Not found'}</Text>
        <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
      </View>
    );
  }

  const badge = attendeeBadge(reg, tokens);
  const name = reg.user.fullName || reg.user.username || 'Attendee';
  const icon = (I: typeof Phone) => <I size={ICON} color={tokens.accent} weight="fill" />;
  const seats = reg.groupSeats ?? [];
  const cancelled = reg.status === 'CANCELLED';
  const answers = Object.entries(reg.formResponses ?? {})
    .map(([id, v]) => {
      const f = fields.find((x) => x.id === id);
      return { id, label: f?.label ?? 'Answer', value: f ? displayFieldValue(f, v) : v == null ? '' : String(v) };
    })
    .filter((a) => a.value !== '');
  // Money moved → it has to leave through a refund, not a plain cancel.
  const paid = Number(reg.totalAmount) > 0 && (reg.paymentStatus === 'PAID' || reg.paymentStatus === 'PARTIALLY_REFUNDED');

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
      }
    >
      <View style={styles.hero}>
        {reg.user.avatarUrl ? (
          <Image source={{ uri: reg.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: tokens.elevated }]}>
            <User size={32} color={tokens.textMuted} />
          </View>
        )}
        <Text style={[styles.name, { color: tokens.text }]}>{name}</Text>
        {reg.user.username ? <Text style={[styles.muted, { color: tokens.textMuted }]}>@{reg.user.username}</Text> : null}
        <Text style={[styles.badge, { color: badge.color }]}>{badge.text}</Text>
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
        <SettingsRow label="Ticket" value={reg.ticketType?.name ?? '—'} />
        {reg.groupSize && reg.groupSize > 1 ? <SettingsRow label="Group size" value={String(reg.groupSize)} /> : null}
        <SettingsRow label="Paid" value={money(reg.totalAmount, reg.ticketType?.currency)} />
        <SettingsRow label="Registered" value={when(reg.registeredAt)} />
        {reg.cancelledAt ? <SettingsRow label="Cancelled" value={when(reg.cancelledAt)} /> : null}
      </SettingsGroup>

      {reg.cancellationReason ? (
        <Text style={[styles.reason, { color: tokens.textSecondary }]}>“{reg.cancellationReason}”</Text>
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
              <Text style={[styles.answerLabel, { color: tokens.textMuted }]}>{a.label}</Text>
              <Text style={[styles.answerValue, { color: tokens.text }]} selectable>
                {a.value}
              </Text>
            </View>
          ))}
        </SettingsGroup>
      ) : null}

      {seats.length > 0 ? (
        <SettingsGroup title={`Group seats · ${seats.filter((x) => x.status === 'CLAIMED').length} of ${seats.length} filled`} plain>
          {seats.map((s) => {
            // Unfilled seats can be retired; retired ones reopened. Frozen once cancelled.
            const action = cancelled
              ? undefined
              : s.status === 'OPEN' || s.status === 'INVITED'
                ? ('release' as const)
                : s.status === 'RELEASED'
                  ? ('reopen' as const)
                  : undefined;
            return (
              <SeatRow
                key={s.seatIndex}
                seat={s}
                fields={fields}
                action={action}
                busy={seatBusy === s.seatIndex}
                onAction={() => seatAction(s.seatIndex, action === 'release')}
              />
            );
          })}
        </SettingsGroup>
      ) : null}

      {!cancelled ? (
        <SettingsGroup title="Actions">
          <SettingsRow
            icon={<ArrowsLeftRight size={ICON} color={tokens.accent} weight="fill" />}
            label="Transfer to someone else"
            onPress={() => openAction('transfer')}
          />
          {paid ? (
            <SettingsRow
              icon={<Receipt size={ICON} color={tokens.danger} weight="fill" />}
              label="Refund and cancel"
              danger
              onPress={() => openAction('refund')}
            />
          ) : (
            <SettingsRow
              icon={<XCircle size={ICON} color={tokens.danger} weight="fill" />}
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
          icon={<ArrowCounterClockwise size={18} color={tokens.text} weight="bold" />}
          onPress={confirmRestore}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  hero: { alignItems: 'center', gap: 4, marginBottom: spacing[6] },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, marginBottom: spacing[2] },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: typography.fontSize['2xl'], textAlign: 'center', ...font('heading') },
  badge: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
  muted: { fontSize: typography.fontSize.sm, ...font() },
  answer: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 2 },
  answerLabel: { fontSize: typography.fontSize.xs, ...font('medium') },
  answerValue: { fontSize: typography.fontSize.base, ...font() },
  reason: { marginTop: -spacing[2], marginBottom: spacing[4], paddingHorizontal: spacing[2], fontSize: typography.fontSize.sm, fontStyle: 'italic', ...font() },
});
