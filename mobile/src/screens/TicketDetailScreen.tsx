import React, { useLayoutEffect, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowCounterClockwise,
  Bed,
  CalendarBlank,
  CheckCircle,
  Export,
  ShareNetwork,
  Ticket as TicketIcon,
  Trophy,
  UsersThree,
  WhatsappLogo,
  XCircle,
  PencilSimple,
} from '@unifesto/unicon/react-native';
import AttendingShareModal from '../components/AttendingShareModal';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { useTicketDetail } from '../hooks/useTicketDetail';
import { useBannerAccent } from '../hooks/useBannerPalette';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { useEventStays } from '../hooks/useEventStays';
import useTopSpacing from '../hooks/useTopSpacing';
import ReportSheet from '../components/ReportSheet';
import { useTokens } from '../context/ThemeContext';
import { countdownLabel, formatTime } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CosmosWash, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import { CardSurfaceProvider, DEFAULT_CARD_SURFACE } from '../components/ui/CardSurface';

const GUTTER = spacing[6];
const NOTCH = 22;
// Event banners are 4:3.
const THUMB_W = 88;
const THUMB_H = 66;

/**
 * The entry pass, in the same fusion look as the event page: the cosmos sky
 * lit by the event's colour (an approved white-label colour, else the cover's
 * hue). One ticket card (event, when/where, ticket type, tear line, big QR
 * stub), then grouped actions — share, calendar, group, WhatsApp, check-in
 * history, and refund/cancel at the bottom.
 */
export default function TicketDetailScreen() {
  const params = useLocalSearchParams<{ id: string; ticket?: string }>();
  const t = useTicketDetail(params.ticket);
  const coverHue = useBannerAccent(t.cover, t.eventSlug ? { event: t.eventSlug } : null);
  const hue = t.brandColor || coverHue;
  return (
    <CosmosWash active={!!hue}>
      <CardSurfaceProvider kind={hue ? 'glass' : DEFAULT_CARD_SURFACE}>
        <TicketDetailView t={t} hue={hue} />
      </CardSurfaceProvider>
    </CosmosWash>
  );
}

function TicketDetailView({ t, hue }: { t: ReturnType<typeof useTicketDetail>; hue: string | null }) {
  const c = useCosmos();
  const tokens = useTokens();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const { width } = useWindowDimensions();
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // The pass outline is drawn to its measured size; notchY = centre of the tear line.
  const [passSize, setPassSize] = useState<{ width: number; height: number } | null>(null);
  const [notchY, setNotchY] = useState<number | null>(null);
  const stay = useEventStays(t.eventId, t.status !== 'cancelled' && !t.isOnline);

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
              <Export size={24} color={c.text} />
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
              ...(t.canDelete ? [{ id: 'delete', title: 'Delete ticket', icon: MENU_ICONS.delete, destructive: true }] : []),
            ]}
            onSelect={(action) => {
              if (action === 'calendar') t.addToCalendar();
              else if (action === 'event') openEvent();
              else if (action === 'report') setReportOpen(true);
              else if (action === 'delete') t.confirmDelete(() => router.back());
            }}
          />
        </HeaderActions>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, cancelled, t.eventSlug, t.startIso, t.canDelete, c.text]);

  if (!t.ticket) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <TicketIcon size={48} color={c.muted} />
        <Text style={[styles.emptyTitle, { color: c.text }]}>Ticket not found</Text>
        <AuthButton label="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing[6], minWidth: 160 }} />
      </View>
    );
  }

  const badge =
    t.status === 'cancelled'
      ? { text: 'Cancelled', color: tokens.danger, bg: 'rgba(239,68,68,0.14)' }
      : t.status === 'checkedIn'
        ? { text: 'Checked in', color: tokens.success, bg: 'rgba(16,185,129,0.14)' }
        : { text: upcoming ? countdownLabel(t.startIso!) : 'Registered', color: c.text, bg: c.tint };

  const price = Number.isNaN(t.listPrice) ? null : t.listPrice === 0 ? 'Free' : `₹${t.listPrice.toLocaleString('en-IN')}`;

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} hue={hue} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={t.refreshing}
            onRefresh={t.refresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {/* ── The pass ── */}
        <View onLayout={(e) => setPassSize(e.nativeEvent.layout)}>
          {passSize && notchY != null ? (
            <PassShape width={passSize.width} height={passSize.height} notchY={notchY} fill={c.raised} />
          ) : null}
          <View style={styles.passTop} onLayout={(e) => setNotchY(e.nativeEvent.layout.height + NOTCH / 2)}>
            <View style={styles.headRow}>
              <View style={[styles.thumb, { backgroundColor: c.card }]}>
                {t.cover ? (
                  <Image source={{ uri: t.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
                </View>
                <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{t.title}</Text>
              </View>
            </View>

            <View style={styles.facts}>
              {[
                { label: 'Date', value: dateLabel },
                { label: 'Time', value: timeLabel },
                { label: t.isOnline ? 'Access' : 'Venue', value: t.venue },
              ].map((f, i) => (
                <View key={f.label} style={[styles.fact, i === 2 && { flex: 1.4 }]}>
                  <Text style={[styles.factLabel, { color: c.muted }]}>{f.label}</Text>
                  <Text style={[styles.factValue, { color: c.text }]} numberOfLines={2}>{f.value}</Text>
                </View>
              ))}
            </View>

            {t.ticketTypeName ? (
              <View style={[styles.typeRow, { backgroundColor: c.tint }]}>
                <TicketIcon size={18} color={c.soft} />
                <Text style={[styles.typeName, { color: c.text }]} numberOfLines={1}>{t.ticketTypeName}</Text>
                {price ? <Text style={[styles.typePrice, { color: c.text }]}>{price}</Text> : null}
              </View>
            ) : null}
          </View>

          {/* Tear line between the notches PassShape cuts out of both edges */}
          <View style={styles.perfRow}>
            <View style={[styles.perf, { borderColor: c.outline }]} />
          </View>

          {/* The stub: what gets scanned at the door */}
          <View style={styles.stub}>
            <View style={[styles.qr, cancelled && { opacity: 0.12 }]}>
              <QRCode value={t.qrValue} size={qrSize} color="#000000" backgroundColor="#ffffff" />
            </View>
            {cancelled ? (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <XCircle size={40} color={c.danger} weight="fill" />
                <Text style={[styles.voidText, { color: c.danger }]}>This ticket was cancelled</Text>
              </View>
            ) : null}
            {t.code ? <Text style={[styles.code, { color: c.text }]}>{t.code}</Text> : null}
            <Text style={[styles.hint, { color: c.muted }]}>
              {t.status === 'checkedIn' ? 'You are checked in. Enjoy the event.' : 'Show this at the entrance'}
            </Text>
          </View>
        </View>

        {/* Why it was cancelled, when there's something worth saying */}
        {cancelled && (t.cancellation.reason || t.cancellation.byOrganiser || t.cancelledAt) ? (
          <SettingsGroup title="Cancellation" plain surface={c.raised}>
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
                <Text style={[styles.reasonLabel, { color: c.muted }]}>Reason</Text>
                <Text style={[styles.reasonText, { color: c.text }]}>{t.cancellation.reason}</Text>
              </View>
            ) : null}
          </SettingsGroup>
        ) : null}

        {/* ── Actions ── */}
        {!cancelled ? (
          <SettingsGroup surface={c.raised}>
            <SettingsRow
              icon={<ShareNetwork size={24} color={c.text} />}
              label="Share that I'm going"
              onPress={() => setShareOpen(true)}
            />
            {t.eventSlug && t.startIso && upcoming ? (
              <SettingsRow icon={<CalendarBlank size={24} color={c.text} />} label="Add to calendar" onPress={t.addToCalendar} />
            ) : null}
            {t.canManageGroup ? (
              <SettingsRow
                icon={<UsersThree size={24} color={c.text} />}
                label="Manage group"
                onPress={() => router.push(`/group/${t.registrationId}` as never)}
              />
            ) : null}
            {/* Group leads edit everything from Manage group. */}
            {t.canEditDetails && !t.canManageGroup ? (
              <SettingsRow
                icon={<PencilSimple size={24} color={c.text} />}
                label="Edit my details"
                value={
                  t.editDetailsUntil
                    ? `until ${new Date(t.editDetailsUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                    : undefined
                }
                onPress={() =>
                  router.push({ pathname: '/edit-details', params: { registrationId: t.registrationId!, title: t.title } } as never)
                }
              />
            ) : null}
            {t.hackathon && t.eventId ? (
              <SettingsRow
                icon={<Trophy size={24} color={c.text} />}
                label="Unifesto Sprint"
                value={t.hackathon.cancelled ? 'Cancelled' : t.hackathon.teamCode ?? undefined}
                onPress={() => router.push(`/hackathon/${t.eventId}` as never)}
              />
            ) : null}
            {t.competition && t.eventId ? (
              <SettingsRow
                icon={<Trophy size={24} color={c.text} />}
                label="Competition"
                value={t.competition.status}
                onPress={() => router.push(`/competition/${t.eventId}` as never)}
              />
            ) : null}
            {stay ? (
              <SettingsRow
                icon={<Bed size={24} color={c.text} />}
                label={stay.label}
                value={stay.value}
                onPress={() => router.push(stay.href as never)}
              />
            ) : null}
            {t.eventSlug ? (
              <SettingsRow icon={<TicketIcon size={24} color={c.text} />} label="View event" onPress={openEvent} />
            ) : null}
          </SettingsGroup>
        ) : null}

        {!cancelled && t.waGroup?.inviteUrl ? (
          <SettingsGroup title={`WhatsApp ${t.waGroup.isCommunity ? 'community' : 'group'}`} surface={c.raised}>
            <SettingsRow
              icon={<WhatsappLogo size={24} color="#25D366" weight="fill" />}
              label={`Join the ${t.waGroup.isCommunity ? 'community' : 'group'}`}
              external
              onPress={t.openWhatsapp}
            />
            <SettingsRow
              icon={<CheckCircle size={24} color={t.waGroup.joined ? tokens.success : c.muted} weight={t.waGroup.joined ? 'fill' : 'regular'} />}
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
          <SettingsGroup title="Check-ins" surface={c.raised}>
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
          <SettingsGroup surface={c.raised}>
            {t.canRefund ? (
              <SettingsRow
                icon={<ArrowCounterClockwise size={24} color={c.danger} />}
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
                icon={<XCircle size={24} color={c.danger} />}
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

/**
 * The pass card's fill as one path: rounded corners plus a semicircle bitten
 * out of each edge at the tear line. Real cut-outs, so whatever is behind the
 * pass (the banner nebula) shows through the notches instead of a painted disc.
 */
function PassShape({ width: w, height: h, notchY: y, fill }: { width: number; height: number; notchY: number; fill: string }) {
  const r = cosmosCardRadius;
  const n = NOTCH / 2;
  const d = [
    `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${y - n} A ${n} ${n} 0 0 0 ${w} ${y + n}`,
    `V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${y + n} A ${n} ${n} 0 0 0 0 ${y - n}`,
    `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
  ].join(' ');
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} fill={fill} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  reason: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 2 },
  reasonLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  reasonText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  passTop: { padding: spacing[5], gap: spacing[5] },
  headRow: { flexDirection: 'row', gap: spacing[4], alignItems: 'flex-start' },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: 12, overflow: 'hidden' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 12, ...cosmosFont.strong },
  // Michroma runs wide: 17 reads like a 20 in a narrower face.
  title: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  facts: { flexDirection: 'row', gap: spacing[3] },
  fact: { flex: 1, gap: 3 },
  factLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  factValue: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.3, ...cosmosFont.strong },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: 14,
  },
  typeName: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  typePrice: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  perfRow: { height: NOTCH, justifyContent: 'center' },
  perf: { marginHorizontal: NOTCH, borderTopWidth: 1.5, borderStyle: 'dashed' },
  stub: { alignItems: 'center', paddingTop: spacing[4], paddingBottom: spacing[6], paddingHorizontal: spacing[5] },
  // The QR keeps its white field: scanners need the contrast.
  qr: { padding: 14, borderRadius: 16, backgroundColor: '#ffffff' },
  voidText: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  code: { marginTop: spacing[4], fontSize: 18, ...cosmosFont.display, letterSpacing: 2 },
  hint: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  emptyTitle: { marginTop: spacing[4], fontSize: 17, ...cosmosFont.display },
});
