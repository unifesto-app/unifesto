import React, { useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowCounterClockwise,
  CalendarBlank,
  CheckCircle,
  Export,
  ShareNetwork,
  Ticket as TicketIcon,
  Trophy,
  UsersThree,
  WhatsappLogo,
  XCircle,
} from 'phosphor-react-native';
import AttendingShareModal from '../components/AttendingShareModal';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { useTicketDetail } from '../hooks/useTicketDetail';
import useTopSpacing from '../hooks/useTopSpacing';
import ReportSheet from '../components/ReportSheet';
import { useTokens } from '../context/ThemeContext';
import { countdownLabel, formatTime } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';
import { CardBackdrop } from '../components/ui/CardSurface';

const GUTTER = spacing[6];
const NOTCH = 22;
// Event banners are 4:3.
const THUMB_W = 88;
const THUMB_H = 66;

/**
 * The entry pass: one ticket card (event, when/where, ticket type, tear line,
 * big QR stub), then grouped actions — share, calendar, group, WhatsApp,
 * check-in history, and refund/cancel at the bottom.
 */
export default function TicketDetailScreen() {
  const tokens = useTokens();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; ticket?: string }>();
  const t = useTicketDetail(params.ticket);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const accent = t.brandColor || tokens.accent;
  const cancelled = t.status === 'cancelled';
  const qrSize = Math.min(220, width - GUTTER * 2 - spacing[16]);

  const start = t.startIso ? new Date(t.startIso) : null;
  const dateLabel = start ? start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBA';
  const timeLabel = start ? formatTime(start) : 'TBA';
  const upcoming = !!start && start.getTime() > Date.now();

  const openEvent = () => t.eventSlug && router.push(`/event/${t.eventSlug}`);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderActions>
          {!cancelled ? (
            <HeaderIconButton onPress={() => setShareOpen(true)} label="Share that I'm going">
              <Export size={24} color={tokens.text} />
            </HeaderIconButton>
          ) : null}
          <HeaderMenu
            title="Ticket"
            items={[
              ...(t.eventSlug && t.startIso && !cancelled
                ? [{ id: 'calendar', title: 'Add to calendar', icon: MENU_ICONS.calendar }]
                : []),
              ...(t.eventSlug ? [{ id: 'event', title: 'View event', icon: MENU_ICONS.website }] : []),
              { id: 'report', title: 'Report an issue', icon: MENU_ICONS.report, destructive: true },
            ]}
            onSelect={(action) => {
              if (action === 'calendar') t.addToCalendar();
              else if (action === 'event') openEvent();
              else if (action === 'report') setReportOpen(true);
            }}
          />
        </HeaderActions>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, cancelled, t.eventSlug, t.startIso, tokens.text]);

  if (!t.ticket) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: tokens.bg }]}>
        <TicketIcon size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>Ticket not found</Text>
        <Text style={[styles.link, { color: accent }]} onPress={() => router.back()}>
          Go back
        </Text>
      </View>
    );
  }

  const badge =
    t.status === 'cancelled'
      ? { text: 'Cancelled', color: tokens.danger, bg: 'rgba(239,68,68,0.14)' }
      : t.status === 'checkedIn'
        ? { text: 'Checked in', color: tokens.success, bg: 'rgba(16,185,129,0.14)' }
        : { text: upcoming ? countdownLabel(t.startIso!) : 'Registered', color: accent, bg: 'rgba(52,145,255,0.14)' };

  const price = Number.isNaN(t.listPrice) ? null : t.listPrice === 0 ? 'Free' : `₹${t.listPrice.toLocaleString('en-IN')}`;

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 100 }}>
        {/* ── The pass ── */}
        <View style={[styles.pass]}>
          <CardBackdrop shape={styles.pass} />
          <View style={styles.passTop}>
            <View style={styles.headRow}>
              <View style={[styles.thumb, { backgroundColor: tokens.surface }]}>
                {t.cover ? (
                  <Image source={{ uri: t.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <LinearGradient colors={[accent, tokens.accentStrong]} style={StyleSheet.absoluteFill} />
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
                </View>
                <Text style={[styles.title, { color: tokens.text }]} numberOfLines={3}>{t.title}</Text>
              </View>
            </View>

            <View style={styles.facts}>
              {[
                { label: 'Date', value: dateLabel },
                { label: 'Time', value: timeLabel },
                { label: t.isOnline ? 'Access' : 'Venue', value: t.venue },
              ].map((f, i) => (
                <View key={f.label} style={[styles.fact, i === 2 && { flex: 1.4 }]}>
                  <Text style={[styles.factLabel, { color: tokens.textMuted }]}>{f.label}</Text>
                  <Text style={[styles.factValue, { color: tokens.text }]} numberOfLines={2}>{f.value}</Text>
                </View>
              ))}
            </View>

            {t.ticketTypeName ? (
              <View style={[styles.typeRow, { backgroundColor: tokens.surface }]}>
                <TicketIcon size={18} color={tokens.textSecondary} />
                <Text style={[styles.typeName, { color: tokens.text }]} numberOfLines={1}>{t.ticketTypeName}</Text>
                {price ? <Text style={[styles.typePrice, { color: accent }]}>{price}</Text> : null}
              </View>
            ) : null}
          </View>

          {/* Tear line with notches bitten out of both edges */}
          <View style={styles.perfRow}>
            <View style={[styles.notch, styles.notchLeft, { backgroundColor: tokens.bg }]} />
            <View style={[styles.perf, { borderColor: tokens.border }]} />
            <View style={[styles.notch, styles.notchRight, { backgroundColor: tokens.bg }]} />
          </View>

          {/* The stub: what gets scanned at the door */}
          <View style={styles.stub}>
            <View style={[styles.qr, cancelled && { opacity: 0.12 }]}>
              <QRCode value={t.qrValue} size={qrSize} color="#000000" backgroundColor="#ffffff" />
            </View>
            {cancelled ? (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <XCircle size={40} color={tokens.danger} weight="fill" />
                <Text style={[styles.voidText, { color: tokens.danger }]}>This ticket was cancelled</Text>
              </View>
            ) : null}
            {t.code ? <Text style={[styles.code, { color: tokens.text }]}>{t.code}</Text> : null}
            <Text style={[styles.hint, { color: tokens.textMuted }]}>
              {t.status === 'checkedIn' ? 'You are checked in. Enjoy the event.' : 'Show this at the entrance'}
            </Text>
          </View>
        </View>

        {/* Why it was cancelled, when there's something worth saying */}
        {cancelled && (t.cancellation.reason || t.cancellation.byOrganiser || t.cancelledAt) ? (
          <SettingsGroup title="Cancellation" plain>
            {t.cancelledAt ? (
              <SettingsRow
                label={t.cancellation.byOrganiser ? 'Cancelled by the organiser' : 'Cancelled'}
                value={new Date(t.cancelledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
            ) : t.cancellation.byOrganiser ? (
              <SettingsRow label="Cancelled by the organiser" />
            ) : null}
            {t.cancellation.reason ? (
              <View style={styles.reason}>
                <Text style={[styles.reasonLabel, { color: tokens.textMuted }]}>Reason</Text>
                <Text style={[styles.reasonText, { color: tokens.text }]}>{t.cancellation.reason}</Text>
              </View>
            ) : null}
          </SettingsGroup>
        ) : null}

        {/* ── Actions ── */}
        {!cancelled ? (
          <SettingsGroup>
            <SettingsRow
              icon={<ShareNetwork size={24} color={accent} />}
              label="Share that I'm going"
              onPress={() => setShareOpen(true)}
            />
            {t.eventSlug && t.startIso && upcoming ? (
              <SettingsRow icon={<CalendarBlank size={24} color={accent} />} label="Add to calendar" onPress={t.addToCalendar} />
            ) : null}
            {t.canManageGroup ? (
              <SettingsRow
                icon={<UsersThree size={24} color={accent} />}
                label="Manage group"
                onPress={() => router.push(`/group/${t.registrationId}` as never)}
              />
            ) : null}
            {t.competition && t.eventId ? (
              <SettingsRow
                icon={<Trophy size={24} color={accent} />}
                label="Competition"
                value={t.competition.status}
                onPress={() => router.push(`/competition/${t.eventId}` as never)}
              />
            ) : null}
            {t.eventSlug ? (
              <SettingsRow icon={<TicketIcon size={24} color={accent} />} label="View event" onPress={openEvent} />
            ) : null}
          </SettingsGroup>
        ) : null}

        {!cancelled && t.waGroup?.inviteUrl ? (
          <SettingsGroup title={`WhatsApp ${t.waGroup.isCommunity ? 'community' : 'group'}`}>
            <SettingsRow
              icon={<WhatsappLogo size={24} color="#25D366" weight="fill" />}
              label={`Join the ${t.waGroup.isCommunity ? 'community' : 'group'}`}
              external
              onPress={t.openWhatsapp}
            />
            <SettingsRow
              icon={<CheckCircle size={24} color={t.waGroup.joined ? tokens.success : tokens.textMuted} weight={t.waGroup.joined ? 'fill' : 'regular'} />}
              label="I've joined"
              trailing={
                <Switch
                  value={!!t.waGroup.joined}
                  onValueChange={t.toggleJoinedWhatsapp}
                  disabled={t.waSaving}
                  trackColor={{ false: tokens.fillStrong, true: tokens.success }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={tokens.fillStrong}
                />
              }
            />
          </SettingsGroup>
        ) : null}

        {t.checkins.length > 0 ? (
          <SettingsGroup title="Check-ins">
            {t.checkins.map((c) => {
              const at = new Date(c.checkedInAt);
              const when = `${at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${formatTime(at)}`;
              return (
                <SettingsRow
                  key={c.id}
                  icon={<CheckCircle size={24} color={tokens.success} weight="fill" />}
                  label={[c.checkinType || 'Check-in', c.checkedBy ? `by ${c.checkedBy}` : null].filter(Boolean).join(' · ')}
                  value={when}
                />
              );
            })}
          </SettingsGroup>
        ) : null}

        {t.canRefund || t.canCancelFree ? (
          <SettingsGroup>
            {t.canRefund ? (
              <SettingsRow
                icon={<ArrowCounterClockwise size={24} color={tokens.danger} />}
                label="Refund and status"
                danger
                onPress={() =>
                  router.push({
                    pathname: '/refund/[registrationId]',
                    params: {
                      registrationId: t.registrationId!,
                      eventTitle: t.title,
                      // Completed events can't be refunded; the page then shows status only.
                      ...(t.eventCompleted ? { eventCompleted: '1' } : {}),
                    },
                  })
                }
              />
            ) : null}
            {t.canCancelFree ? (
              <SettingsRow
                icon={<XCircle size={24} color={tokens.danger} />}
                label={t.cancelling ? 'Cancelling…' : 'Cancel ticket'}
                danger
                onPress={t.confirmCancel}
              />
            ) : null}
          </SettingsGroup>
        ) : null}
      </ScrollView>

      <AttendingShareModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        event={{
          title: t.title,
          dateLabel: start ? start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          startIso: t.startIso ?? null,
          venueLabel: t.venue,
          bannerUrl: t.cover,
          spaceLogoUrl: t.spaceLogo || null,
          brandColor: t.brandColor,
        }}
      />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="REGISTRATION"
        targetId={t.registrationId}
        subject={t.title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  reason: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 2 },
  reasonLabel: { fontSize: typography.fontSize.xs, ...font('medium') },
  reasonText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...font() },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pass: { borderRadius: borderRadius['2xl'], overflow: 'hidden' },
  passTop: { padding: spacing[5], gap: spacing[5] },
  headRow: { flexDirection: 'row', gap: spacing[4], alignItems: 'flex-start' },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontSize: 12, ...font('semibold') },
  title: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.2, ...font('heading') },
  facts: { flexDirection: 'row', gap: spacing[3] },
  fact: { flex: 1, gap: 3 },
  factLabel: { fontSize: typography.fontSize.xs, ...font('medium') },
  factValue: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.3, ...font('semibold') },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  typeName: { flex: 1, fontSize: typography.fontSize.sm, ...font('semibold') },
  typePrice: { fontSize: typography.fontSize.sm, ...font('semibold') },
  perfRow: { height: NOTCH, justifyContent: 'center' },
  perf: { marginHorizontal: NOTCH, borderTopWidth: 1.5, borderStyle: 'dashed' },
  notch: { position: 'absolute', width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  stub: { alignItems: 'center', paddingTop: spacing[4], paddingBottom: spacing[6], paddingHorizontal: spacing[5] },
  qr: { padding: 14, borderRadius: borderRadius.xl, backgroundColor: '#ffffff' },
  voidText: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  code: {
    marginTop: spacing[4],
    fontSize: typography.fontSize.xl,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    ...font('heading'),
  },
  hint: { marginTop: 4, fontSize: typography.fontSize.sm, ...font() },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, ...font('heading') },
  link: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...font('semibold') },
});
