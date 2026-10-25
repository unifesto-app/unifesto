import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarBlank,
  CheckCircle,
  CurrencyInr,
  IdentificationCard,
  Phone,
  SignIn,
  SignOut,
  Warning,
  XCircle,
} from '@unifesto/unicon/react-native';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import useTopSpacing from '../hooks/useTopSpacing';
import { getFormUploadUrl, FIELD_TYPE_MAP, type CustomField } from '../lib/api/tickets';
import {
  approveStayBooking,
  cancelStayBooking,
  checkInStay,
  checkOutStay,
  getStayBooking,
  GUEST_GENDER_LABELS,
  markStayPaid,
  PAYMENT_LABELS,
  rangeLabel,
  rejectStayBooking,
  rupees,
  STATUS_LABELS,
  updateStayBooking,
  type TeamStayBooking,
} from '../lib/api/stays';
import type { Result } from '../lib/api/manageEvent';
import { displayAnswer, isFileAnswer, type FileAnswer } from '../utils/formQuestions';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * One stay booking, for the event team: who's coming (with their IDs), what
 * they answered, and the next step — approve and assign a room, take payment
 * at the property, check in and out, or cancel.
 */
export default function StayBookingDetailScreen() {
  // `desk=1`: Crew at the property. They take payment and check guests in and
  // out, but approving, cancelling, rooms and ID files are for the organisers.
  const { eventId, bookingId, desk: deskParam } = useLocalSearchParams<{ eventId: string; bookingId: string; desk?: string }>();
  const desk = deskParam === '1';
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [b, setB] = useState<TeamStayBooking | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [allocation, setAllocation] = useState('');
  const [staffNote, setStaffNote] = useState('');
  const [reason, setReason] = useState('');

  const take = (data: TeamStayBooking) => {
    setB(data);
    setAllocation(data.allocation ?? '');
    setStaffNote(data.staffNote ?? '');
  };

  const load = useCallback(async () => {
    if (!eventId || !bookingId) return;
    const res = await getStayBooking(eventId, bookingId);
    if (res.ok) take(res.data);
    else setError(res.denied ? "You can't open this booking." : res.message);
  }, [eventId, bookingId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!b) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? <Text style={[styles.note, { color: c.muted }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const run = async (key: string, fn: () => Promise<Result<TeamStayBooking>>, done?: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return AppAlert.alert("Couldn't do that", res.message);
    take(res.data);
    setReason('');
    if (done) AppAlert.alert(done);
  };

  const approve = () => run('approve', () => approveStayBooking(eventId!, b.id, allocation.trim() || undefined));
  const decline = () =>
    AppAlert.alert('Decline this request?', 'The guest is told, with your reason if you wrote one.', [
      { text: 'Back', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void run('reject', () => rejectStayBooking(eventId!, b.id, reason.trim() || undefined)) },
    ]);
  const paidOnline = b.paymentMode === 'ONLINE' && b.paymentStatus === 'PAID';
  const cancel = () =>
    AppAlert.alert(
      'Cancel this stay?',
      paidOnline
        ? `They paid ${rupees(b.totalAmount)} online. A refund returns ${rupees(b.totalAmount - b.processingFee)} (the processing fee is kept).`
        : 'The bed is released and the guest is told.',
      [
        { text: 'Back', style: 'cancel' },
        ...(paidOnline
          ? [
              {
                text: 'Cancel and refund',
                style: 'destructive' as const,
                onPress: () => void run('cancel', () => cancelStayBooking(eventId!, b.id, { reason: reason.trim() || undefined, refund: true })),
              },
              {
                text: 'Cancel, no refund',
                style: 'destructive' as const,
                onPress: () => void run('cancel', () => cancelStayBooking(eventId!, b.id, { reason: reason.trim() || undefined, refund: false })),
              },
            ]
          : [
              {
                text: 'Cancel stay',
                style: 'destructive' as const,
                onPress: () => void run('cancel', () => cancelStayBooking(eventId!, b.id, { reason: reason.trim() || undefined })),
              },
            ]),
      ],
    );

  const openId = async (f: FileAnswer) => {
    try {
      await Linking.openURL(await getFormUploadUrl(eventId!, f.key));
    } catch (e) {
      AppAlert.alert("Couldn't open the ID", e instanceof Error ? e.message : 'Try again.');
    }
  };

  const unpaidAtProperty = b.paymentMode === 'PAY_AT_PROPERTY' && b.paymentStatus !== 'PAID';
  const notesDirty = allocation !== (b.allocation ?? '') || staffNote !== (b.staffNote ?? '');
  const openStatus = b.status === 'PENDING' || b.status === 'AWAITING_PAYMENT' || b.status === 'CONFIRMED';
  const booker = b.guests.find((g) => g.isBooker) ?? b.guests[0];
  const questions: CustomField[] = b.questions.map((q) => ({
    id: q.id,
    event_id: eventId!,
    label: q.label,
    field_type: q.type === 'CHECKBOX' && q.options.length ? 'multi_select' : FIELD_TYPE_MAP[q.type] ?? 'text',
    is_required: false,
    options_json: q.options.map((o) => ({ label: o, value: o })),
    display_order: q.order,
    created_at: '',
    updated_at: '',
  }));
  const answered = questions.filter((q) => q.field_type !== 'section' && b.answers[q.id] !== undefined && b.answers[q.id] !== '');
  const tone =
    b.status === 'PENDING' || b.status === 'AWAITING_PAYMENT'
      ? c.warn
      : b.status === 'REJECTED' || b.status === 'CANCELLED' || b.status === 'EXPIRED'
        ? c.danger
        : c.success;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 80 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.status, { color: tone }]}>{STATUS_LABELS[b.status]}</Text>
        <Text style={[styles.title, { color: c.text }]}>
          {booker?.name || b.user.fullName || 'Guest'}
          {b.guestCount > 1 ? ` +${b.guestCount - 1}` : ''}
        </Text>
        <Text style={[styles.sub, { color: c.soft }]}>
          {b.stay.name} · {b.option.name}
        </Text>
        <Text style={[styles.sub, { color: c.muted }]}>
          {rangeLabel(b.checkInDate, b.checkOutDate, b.nights)} · Pass {b.passCode}
        </Text>

        {/* ── Next step ── */}
        {b.status === 'PENDING' && desk ? (
          <View style={[styles.banner, { backgroundColor: c.tint }]}>
            <Warning size={20} color={c.warn} />
            <Text style={[styles.bannerText, { color: c.text }]}>Not approved yet. Ask an organiser to approve it first.</Text>
          </View>
        ) : b.status === 'PENDING' ? (
          <View style={styles.actions}>
            <Button label="Approve" size="lg" fullWidth loading={busy === 'approve'} disabled={!!busy} onPress={() => void approve()} />
            <Text style={[styles.note, { color: c.muted }]}>
              {b.paymentMode === 'ONLINE' && b.totalAmount
                ? `They'll have to pay ${rupees(b.totalAmount)} in the app to confirm. Add the room below first if you know it.`
                : 'Confirms the stay and sends their Stay Pass. Add the room below first if you know it.'}
            </Text>
          </View>
        ) : b.status === 'AWAITING_PAYMENT' ? (
          <View style={[styles.banner, { backgroundColor: c.tint }]}>
            <CurrencyInr size={20} color={c.warn} />
            <Text style={[styles.bannerText, { color: c.text }]}>
              Waiting for {rupees(b.totalAmount)}
              {b.paymentDueAt ? ` until ${when(b.paymentDueAt)}` : ''}. The bed is held.
            </Text>
          </View>
        ) : b.status === 'CONFIRMED' ? (
          <View style={styles.actions}>
            {unpaidAtProperty && desk ? (
              // Crew can't mark a stay paid on its own (S30); they record the money with the check-in.
              <Button
                label={`Collected ${rupees(b.totalAmount)}, check in`}
                size="lg"
                fullWidth
                loading={busy === 'in'}
                disabled={!!busy}
                icon={<SignIn size={18} color={c.primaryFg} />}
                onPress={() =>
                  AppAlert.alert(`Took ${rupees(b.totalAmount)}?`, 'This records the payment and checks the guest in.', [
                    { text: 'Back', style: 'cancel' },
                    { text: 'Yes, check in', onPress: () => void run('in', () => checkInStay(eventId!, b.id, true), 'Checked in') },
                  ])
                }
              />
            ) : unpaidAtProperty ? (
              <Button
                label={`Mark ${rupees(b.totalAmount)} collected`}
                variant="secondary"
                size="lg"
                fullWidth
                loading={busy === 'paid'}
                disabled={!!busy}
                icon={<CurrencyInr size={18} color={c.text} />}
                onPress={() => void run('paid', () => markStayPaid(eventId!, b.id))}
              />
            ) : null}
            {unpaidAtProperty && desk ? null : (
            <Button
              label="Check in"
              size="lg"
              fullWidth
              loading={busy === 'in'}
              disabled={!!busy || unpaidAtProperty}
              icon={<SignIn size={18} color={c.primaryFg} />}
              onPress={() => void run('in', () => checkInStay(eventId!, b.id), 'Checked in')}
            />
            )}
            {unpaidAtProperty && !desk ? (
              <Text style={[styles.note, { color: c.muted }]}>Collect the payment first.</Text>
            ) : null}
          </View>
        ) : b.status === 'CHECKED_IN' ? (
          <View style={styles.actions}>
            <View style={[styles.banner, { backgroundColor: c.tint }]}>
              <CheckCircle size={20} color={c.success} weight="fill" />
              <Text style={[styles.bannerText, { color: c.text }]}>Checked in {b.checkedInAt ? when(b.checkedInAt) : ''}</Text>
            </View>
            <Button
              label="Check out"
              variant="secondary"
              size="lg"
              fullWidth
              loading={busy === 'out'}
              disabled={!!busy}
              icon={<SignOut size={18} color={c.text} />}
              onPress={() => void run('out', () => checkOutStay(eventId!, b.id))}
            />
          </View>
        ) : (
          <View style={[styles.banner, { backgroundColor: c.tint }]}>
            <Warning size={20} color={c.danger} />
            <Text style={[styles.bannerText, { color: c.text }]}>
              {b.rejectionReason || b.cancellationReason || STATUS_LABELS[b.status]}
            </Text>
          </View>
        )}

        {/* ── Room & notes ── */}
        {desk ? (
          <SettingsGroup title="Room">
            <SettingsRow label={b.allocation || 'Not assigned yet'} />
            {b.staffNote ? <SettingsRow label={b.staffNote} /> : null}
          </SettingsGroup>
        ) : (
        <SettingsGroup title="Room" plain>
          <FieldRow stacked label="Room / bed (the guest sees this)" value={allocation} onChangeText={setAllocation} placeholder="Block B, Room 204" />
          <FieldRow stacked multiline label="Team note (only your team sees this)" value={staffNote} onChangeText={setStaffNote} />
        </SettingsGroup>
        )}
        {notesDirty && !desk ? (
          <Button
            label="Save room and note"
            variant="secondary"
            fullWidth
            loading={busy === 'notes'}
            disabled={!!busy}
            onPress={() =>
              void run('notes', () =>
                updateStayBooking(eventId!, b.id, { allocation: allocation.trim() || null, staffNote: staffNote.trim() || null }),
              )
            }
            style={{ marginTop: spacing[3] }}
          />
        ) : null}

        {/* ── Guests ── */}
        <SettingsGroup title={`Guests (${b.guestCount})`}>
          {b.guests.map((g) => (
            <View key={g.id ?? g.name}>
              <SettingsRow
                label={g.isBooker ? `${g.name} (booked)` : g.name}
                value={GUEST_GENDER_LABELS[g.gender]}
                onPress={g.phone ? () => void Linking.openURL(`tel:${g.phone}`) : undefined}
              />
              <Text style={[styles.rowSub, { color: c.muted }]}>{[g.phone, g.email].filter(Boolean).join(' · ') || 'No contact given'}</Text>
              {g.idProof && !desk ? (
                <SettingsRow
                  icon={<IdentificationCard size={22} color={c.primary} />}
                  label="View ID"
                  value={g.idProof.name}
                  external
                  onPress={() => void openId(g.idProof!)}
                />
              ) : null}
            </View>
          ))}
        </SettingsGroup>

        <SettingsGroup title="Arrival and emergency">
          <SettingsRow
            icon={<CalendarBlank size={22} color={c.primary} />}
            label="Arriving"
            value={b.arrivalAt ? when(b.arrivalAt) : 'Not given'}
          />
          {b.emergencyPhone ? (
            <SettingsRow
              icon={<Phone size={22} color={c.primary} />}
              label={b.emergencyName || 'Emergency contact'}
              value={b.emergencyPhone}
              onPress={() => void Linking.openURL(`tel:${b.emergencyPhone}`)}
            />
          ) : null}
        </SettingsGroup>
        {b.note ? (
          <SettingsGroup title="Their note" plain>
            <Text style={[styles.body, { color: c.soft }]}>{b.note}</Text>
          </SettingsGroup>
        ) : null}

        {answered.length ? (
          <SettingsGroup title="Answers" plain>
            {answered.map((q) => {
              const v = b.answers[q.id];
              return (
                <View key={q.id} style={styles.answer}>
                  <Text style={[styles.answerLabel, { color: c.muted }]}>{q.label}</Text>
                  {isFileAnswer(v) && desk ? (
                    <Text style={[styles.answerValue, { color: c.text }]}>{v.name}</Text>
                  ) : isFileAnswer(v) ? (
                    <Text style={[styles.answerValue, { color: c.primary }]} onPress={() => void openId(v)}>
                      {v.name}
                    </Text>
                  ) : (
                    <Text style={[styles.answerValue, { color: c.text }]}>{displayAnswer(q, v)}</Text>
                  )}
                </View>
              );
            })}
          </SettingsGroup>
        ) : null}

        {/* ── Payment ── */}
        <SettingsGroup title="Payment">
          <SettingsRow label={b.totalAmount ? PAYMENT_LABELS[b.paymentMode] : 'Free'} value={b.totalAmount ? rupees(b.totalAmount) : undefined} />
          {b.processingFee ? <SettingsRow label="Includes processing fee" value={rupees(b.processingFee)} /> : null}
          {b.totalAmount ? (
            <SettingsRow label="Status" value={b.paymentStatus === 'PAID' ? `Paid${b.paidAt ? ` ${when(b.paidAt)}` : ''}` : b.paymentStatus === 'REFUNDED' ? 'Refunded' : 'Not paid'} />
          ) : null}
          {b.refundedAmount ? <SettingsRow label="Refunded" value={rupees(b.refundedAmount)} /> : null}
        </SettingsGroup>

        {/* ── Decline / cancel ── */}
        {openStatus && !desk ? (
          <>
            <SettingsGroup title={b.status === 'PENDING' ? 'Decline' : 'Cancel'} plain>
              <FieldRow stacked label="Reason for the guest (optional)" value={reason} onChangeText={setReason} />
            </SettingsGroup>
            <Button
              label={b.status === 'CONFIRMED' ? 'Cancel stay' : 'Decline request'}
              variant="danger"
              fullWidth
              loading={busy === 'reject' || busy === 'cancel'}
              disabled={!!busy}
              icon={<XCircle size={18} color={c.danger} />}
              onPress={b.status === 'CONFIRMED' ? cancel : decline}
              style={{ marginTop: spacing[3] }}
            />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  status: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  title: { marginTop: spacing[1], fontSize: typography.fontSize['2xl'], lineHeight: typography.fontSize['2xl'] * 1.2, ...cosmosFont.display },
  sub: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { marginTop: spacing[5], gap: spacing[3] },
  banner: { marginTop: spacing[5], flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: borderRadius.lg },
  bannerText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.strong },
  note: { marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
  rowSub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  body: { padding: spacing[4], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  answer: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 2 },
  answerLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  answerValue: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
});
