import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import RazorpayCheckout from 'react-native-razorpay';
import {
  Bed,
  CalendarBlank,
  CheckCircle,
  Clock,
  CurrencyInr,
  HourglassMedium,
  MapPin,
  Phone,
  Ticket,
  UsersThree,
  XCircle,
} from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  cancelMyStay,
  createStayOrder,
  getMyStay,
  GUEST_GENDER_LABELS,
  PAYMENT_LABELS,
  rangeLabel,
  rupees,
  STATUS_LABELS,
  verifyStayPayment,
  type StayBooking,
} from '../lib/api/stays';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * The guest's own Unifesto Stay. Before confirmation it says where the request
 * stands (and takes payment when approved); once confirmed it is the Stay
 * Pass: a QR the event team scans when the guest arrives at the property.
 */
export default function StayPassScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing(8);
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [b, setB] = useState<StayBooking | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useAnalyticsScreenTracking('StayPass');

  const load = useCallback(async () => {
    if (!bookingId) return;
    const res = await getMyStay(bookingId);
    if (res.ok) {
      setB(res.data);
      setError('');
    } else setError(res.message);
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!b) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const qrSize = Math.min(220, width - GUTTER * 2 - spacing[16]);
  const closed = b.status === 'REJECTED' || b.status === 'CANCELLED' || b.status === 'EXPIRED';
  const paidOnline = b.paymentMode === 'ONLINE' && b.paymentStatus === 'PAID';
  const canCancel = (b.status === 'PENDING' || b.status === 'AWAITING_PAYMENT' || b.status === 'CONFIRMED') && !paidOnline;
  const badge = closed
    ? { color: tokens.danger, bg: 'rgba(239,68,68,0.14)' }
    : b.status === 'PENDING' || b.status === 'AWAITING_PAYMENT'
      ? { color: tokens.warning, bg: 'rgba(245,158,11,0.14)' }
      : { color: tokens.success, bg: 'rgba(16,185,129,0.14)' };

  const pay = async () => {
    setPaying(true);
    try {
      const order = await createStayOrder(b.id);
      if (!order.ok) {
        AppAlert.alert("Couldn't start payment", order.message);
        return;
      }
      const payment: any = await RazorpayCheckout.open({
        key: order.data.razorpayKeyId,
        order_id: order.data.razorpayOrderId,
        amount: order.data.amount,
        currency: order.data.currency || 'INR',
        name: 'Unifesto Stay',
        description: `${b.stay.name} · ${b.event.title}`,
        image: b.stay.coverImageUrl || b.event.coverImageUrl || 'https://unifesto.app/logo.png',
        prefill: { name: user?.fullName || '', email: '', contact: user?.mobileNumber || '' },
        theme: { color: '#3491ff' },
      } as any);
      const verified = await verifyStayPayment(b.id, {
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      });
      if (!verified.ok) {
        AppAlert.alert('Payment received', "We're confirming it. Pull down to refresh in a moment.");
      } else {
        setB(verified.data);
        AppAlert.alert('Stay confirmed', 'Your Stay Pass is ready.');
      }
    } catch (err: any) {
      // Razorpay reports a dismissed sheet as an error; nothing to alarm anyone about.
      const cancelled = err?.code === 0 || err?.description === 'Payment Cancelled';
      if (!cancelled) AppAlert.alert('Payment failed', err?.description || err?.message || 'Please try again');
    } finally {
      setPaying(false);
      void load();
    }
  };

  const cancel = () =>
    AppAlert.alert('Cancel this stay?', 'Your bed goes back to the event team. You can request again if beds are left.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel stay',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const res = await cancelMyStay(b.id);
          setCancelling(false);
          if (!res.ok) return AppAlert.alert("Couldn't cancel", res.message);
          setB(res.data);
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 100 }}
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
      {/* ── The pass ── */}
      <View style={styles.pass}>
        <CardBackdrop shape={styles.pass} />
        <View style={styles.passTop}>
          <Text style={[styles.kicker, { color: tokens.accent }]}>UNIFESTO STAY PASS</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{STATUS_LABELS[b.status]}</Text>
          </View>
          <Text style={[styles.title, { color: tokens.text }]}>{b.stay.name}</Text>
          <Text style={[styles.sub, { color: tokens.textSecondary }]}>
            {b.option.name} · {b.event.title}
          </Text>
          <View style={styles.facts}>
            <Fact label="Stay" value={rangeLabel(b.checkInDate, b.checkOutDate, b.nights)} />
          </View>
          <View style={styles.facts}>
            <Fact label="Guests" value={String(b.guestCount)} />
            <Fact label="Room / bed" value={b.allocation || (b.passCode ? 'At check-in' : '—')} />
          </View>
        </View>

        <View style={[styles.stub, { borderTopColor: tokens.border }]}>
          {b.passCode ? (
            <>
              <View style={[styles.qr, (b.status === 'CHECKED_OUT') && { opacity: 0.2 }]}>
                <QRCode value={b.passCode} size={qrSize} color="#000000" backgroundColor="#ffffff" />
              </View>
              <Text style={[styles.code, { color: tokens.text }]}>{b.passCode}</Text>
              <Text style={[styles.hint, { color: tokens.textMuted }]}>
                {b.status === 'CHECKED_IN'
                  ? `Checked in ${b.checkedInAt ? when(b.checkedInAt) : ''}. Enjoy your stay.`
                  : b.status === 'CHECKED_OUT'
                    ? 'Checked out. Thanks for staying.'
                    : 'Show this at the property when you arrive'}
              </Text>
            </>
          ) : b.status === 'PENDING' ? (
            <StubMessage icon={<HourglassMedium size={40} color={tokens.warning} weight="duotone" />} title="Waiting for the event team">
              They review each request. Your pass appears here once they confirm.
            </StubMessage>
          ) : b.status === 'AWAITING_PAYMENT' ? (
            <StubMessage icon={<CurrencyInr size={40} color={tokens.accent} weight="duotone" />} title={`Pay ${rupees(b.totalAmount)} to confirm`}>
              {b.paymentDueAt ? `Your bed is held until ${when(b.paymentDueAt)}.` : 'Your bed is held for a short while.'}
            </StubMessage>
          ) : (
            <StubMessage icon={<XCircle size={40} color={tokens.danger} weight="duotone" />} title={STATUS_LABELS[b.status]}>
              {b.status === 'REJECTED'
                ? b.rejectionReason || "The event team couldn't fit you in this time."
                : b.status === 'EXPIRED'
                  ? "The payment window closed, so the bed was released. You can request again if beds are left."
                  : b.cancellationReason || 'This stay was cancelled.'}
            </StubMessage>
          )}
        </View>
      </View>

      {b.status === 'AWAITING_PAYMENT' ? (
        <Button
          label={`Pay ${rupees(b.totalAmount)}`}
          size="lg"
          fullWidth
          loading={paying}
          onPress={() => void pay()}
          style={{ marginTop: spacing[5] }}
        />
      ) : null}

      {/* ── Property ── */}
      <SettingsGroup title="Property">
        {b.stay.address ? (
          <SettingsRow
            icon={<MapPin size={24} color={tokens.accent} />}
            label={b.stay.address}
            external={!!b.stay.mapUrl}
            onPress={b.stay.mapUrl ? () => void Linking.openURL(b.stay.mapUrl!) : undefined}
          />
        ) : null}
        {b.stay.checkInTime || b.stay.checkOutTime ? (
          <SettingsRow
            icon={<Clock size={24} color={tokens.accent} />}
            label={[b.stay.checkInTime && `Check-in ${b.stay.checkInTime}`, b.stay.checkOutTime && `check-out ${b.stay.checkOutTime}`]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : null}
        {b.stay.contactPhone && !closed ? (
          <SettingsRow
            icon={<Phone size={24} color={tokens.accent} />}
            label={b.stay.contactName ? `Call ${b.stay.contactName}` : 'Call the property'}
            value={b.stay.contactPhone}
            onPress={() => void Linking.openURL(`tel:${b.stay.contactPhone}`)}
          />
        ) : null}
        <SettingsRow
          icon={<Ticket size={24} color={tokens.accent} />}
          label="View event"
          onPress={() => router.push(`/event/${b.event.slug || b.event.id}`)}
        />
      </SettingsGroup>

      {b.stay.houseRules ? (
        <SettingsGroup title="House rules" plain>
          <Text style={[styles.body, { color: tokens.textSecondary }]}>{b.stay.houseRules}</Text>
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Guests">
        {b.guests.map((g) => (
          <SettingsRow
            key={g.id ?? g.name}
            icon={<UsersThree size={24} color={tokens.accent} />}
            label={g.isBooker ? `${g.name} (you)` : g.name}
            value={GUEST_GENDER_LABELS[g.gender]}
          />
        ))}
        {b.arrivalAt ? (
          <SettingsRow icon={<CalendarBlank size={24} color={tokens.accent} />} label="Arriving" value={when(b.arrivalAt)} />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Payment">
        <SettingsRow
          icon={<Bed size={24} color={tokens.accent} />}
          label={b.totalAmount ? PAYMENT_LABELS[b.paymentMode] : 'Free stay'}
          value={b.totalAmount ? rupees(b.totalAmount) : undefined}
        />
        {b.paymentStatus === 'PAID' ? (
          <SettingsRow icon={<CheckCircle size={24} color={tokens.success} weight="fill" />} label="Paid" value={b.paidAt ? when(b.paidAt) : undefined} />
        ) : null}
        {b.refundedAmount ? (
          <SettingsRow icon={<CheckCircle size={24} color={tokens.success} />} label="Refunded" value={rupees(b.refundedAmount)} />
        ) : null}
      </SettingsGroup>

      {canCancel ? (
        <SettingsGroup>
          <SettingsRow
            icon={<XCircle size={24} color={tokens.danger} />}
            label={cancelling ? 'Cancelling…' : 'Cancel stay'}
            danger
            onPress={cancel}
          />
        </SettingsGroup>
      ) : paidOnline && !closed && b.status !== 'CHECKED_OUT' ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Paid online. To cancel and get a refund, contact the event team.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const tokens = useTokens();
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: tokens.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: tokens.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function StubMessage({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const tokens = useTokens();
  return (
    <View style={styles.stubMsg}>
      {icon}
      <Text style={[styles.stubTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.hint, { color: tokens.textMuted, textAlign: 'center' }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  pass: { borderRadius: borderRadius['2xl'], overflow: 'hidden' },
  passTop: { padding: spacing[5], gap: spacing[2] },
  kicker: { fontSize: typography.fontSize.xs, letterSpacing: 1.5, ...font('semibold') },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontSize: 12, ...font('semibold') },
  title: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.2, ...font('heading') },
  sub: { fontSize: typography.fontSize.sm, ...font() },
  facts: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  fact: { flex: 1, gap: 3 },
  factLabel: { fontSize: typography.fontSize.xs, ...font('medium') },
  factValue: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.3, ...font('semibold') },
  stub: {
    alignItems: 'center',
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[5],
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  qr: { padding: 14, borderRadius: borderRadius.xl, backgroundColor: '#ffffff' },
  code: { marginTop: spacing[4], fontSize: typography.fontSize.xl, letterSpacing: 2, ...font('heading') },
  hint: { marginTop: 4, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...font() },
  stubMsg: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[4] },
  stubTitle: { fontSize: typography.fontSize.lg, textAlign: 'center', ...font('heading') },
  body: { padding: spacing[4], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  note: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
