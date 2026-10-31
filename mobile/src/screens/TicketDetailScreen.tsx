import React, { useLayoutEffect, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import {
  ArrowCounterClockwise,
  ArrowUpRight,
  Bed,
  CalendarPlus,
  CaretRight,
  Check,
  CheckCircle,
  Export,
  Globe,
  MapPin,
  ShareNetwork,
  Ticket as TicketIcon,
  Trophy,
  UsersThree,
  WhatsappLogo,
  XCircle,
  PencilSimple,
} from '@unifesto/unicon/react-native';
import AttendingShareModal from '../components/AttendingShareModal';
import LivePollsPanel from '../components/tickets/LivePollsPanel';
import { AfterEventGroup, EndedStub, useEventCertificate, useEventFeedback } from '../components/EventEnded';
import LiveQaPanel from '../components/tickets/LiveQaPanel';
import LiveQuizPanel from '../components/tickets/LiveQuizPanel';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { useTicketDetail } from '../hooks/useTicketDetail';
import { useEventStays } from '../hooks/useEventStays';
import { useBannerAccent } from '../hooks/useBannerPalette';
import useTopSpacing from '../hooks/useTopSpacing';
import ReportSheet from '../components/ReportSheet';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import ShadeCard from '../components/ui/ShadeCard';
import { CardBackdrop } from '../components/ui/CardSurface';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER } from '../components/home/Section';
import { countdownLabel, formatTime } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, CosmosWash, useCosmos } from '../theme/cosmos';

const ICON = 24;
const NOTCH = 22;
const STUB = 56;
// Event banners are 4:3.
const THUMB_W = 88;
const THUMB_H = 66;

type TicketDetail = ReturnType<typeof useTicketDetail>;

/**
 * The entry pass, in the fusion cosmos look of the event page: the sky lit by
 * the event's colour (white-label, else the banner's hue), a pass on the sky
 * shade (event, tear line, big QR stub on its white panel), a facts card (when,
 * where, ticket type, view event), then grouped actions with refund/cancel last.
 */
export default function TicketDetailScreen() {
  const params = useLocalSearchParams<{ id: string; ticket?: string }>();
  const t = useTicketDetail(params.ticket);
  const coverHue = useBannerAccent(t.cover, t.eventSlug ? { event: t.eventSlug } : null);
  // An approved white-label colour wins over the cover's hue.
  const hue = t.brandColor || coverHue;
  return (
    <CosmosWash active={!!hue}>
      <TicketDetailView t={t} hue={hue} />
    </CosmosWash>
  );
}

function TicketDetailView({ t, hue }: { t: TicketDetail; hue: string | null }) {
  const c = useCosmos();
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
  const cert = useEventCertificate(t.eventId, t.ended);
  const feedback = useEventFeedback(t.eventId, t.ended);

  const cancelled = t.status === 'cancelled';
  const qrSize = Math.min(220, width - GUTTER * 2 - spacing[16]);

  const start = t.startIso ? new Date(t.startIso) : null;
  const upcoming = !!start && start.getTime() > Date.now();
  // Live engagement (polls) shows only while the event is on.
  const endIso: string | undefined = t.ticket?.endDateTime || t.ticket?.event?.endDateTime;
  const eventLive = !cancelled && !!start && !upcoming && !!endIso && Date.now() <= new Date(endIso).getTime();
  const when = start
    ? {
        month: start.toLocaleDateString('en-IN', { month: 'short' }),
        day: String(start.getDate()),
        weekday: start.toLocaleDateString('en-IN', { weekday: 'long' }),
        time: formatTime(start),
      }
    : { month: '', day: '–', weekday: 'Date to be announced', time: 'Time TBA' };

  const openEvent = () => t.eventSlug && router.push(`/event/${t.eventSlug}`);

  // A case about this ticket; the backend sends it to the organiser's desk (D2).
  // A group member's ticket is the lead's registration, so it goes as the event.
  const getHelp = () =>
    router.push({
      pathname: '/manage/support/assist',
      params: {
        ...(t.ticket?.isGroupMember || !t.registrationId ? { eventId: t.eventId } : { registrationId: t.registrationId }),
        about: t.title,
      },
    });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderActions>
          {!cancelled && !t.ended ? (
            <HeaderIconButton onPress={() => setShareOpen(true)} label="Share that I'm going">
              <Export size={24} color={c.text} />
            </HeaderIconButton>
          ) : null}
          <HeaderMenu
            title="Ticket"
            items={[
              ...(t.eventSlug && t.startIso && !cancelled && !t.ended
                ? [{ id: 'calendar', title: 'Add to calendar', icon: MENU_ICONS.calendar }]
                : []),
              ...(t.eventSlug ? [{ id: 'event', title: 'View event', icon: MENU_ICONS.website }] : []),
              { id: 'help', title: 'Get help', icon: MENU_ICONS.help },
              { id: 'report', title: 'Report an issue', icon: MENU_ICONS.report, destructive: true },
              ...(t.canDelete ? [{ id: 'delete', title: 'Delete ticket', icon: MENU_ICONS.delete, destructive: true }] : []),
            ]}
            onSelect={(action) => {
              if (action === 'calendar') t.addToCalendar();
              else if (action === 'event') openEvent();
              else if (action === 'help') getHelp();
              else if (action === 'report') setReportOpen(true);
              else if (action === 'delete') t.confirmDelete(() => router.back());
            }}
          />
        </HeaderActions>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, cancelled, t.ended, t.eventSlug, t.startIso, t.canDelete, t.eventId, t.registrationId, t.title, c.text]);

  if (!t.ticket) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <TicketIcon size={48} color={c.muted} />
        <Text accessibilityRole="header" style={[styles.emptyTitle, { color: c.text }]}>Ticket not found</Text>
        <AuthButton label="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing[6], minWidth: 160 }} />
      </View>
    );
  }

  // The status as plain text: a tick when checked in, the countdown in the pass's sky.
  const badge: { text: string; color: string; tick?: boolean } =
    t.status === 'cancelled'
      ? { text: 'Cancelled', color: c.danger }
      : t.ended
        ? { text: t.status === 'checkedIn' ? 'Attended' : 'Ended', color: c.muted }
        : t.status === 'checkedIn'
          ? { text: 'Checked in', color: c.mint, tick: true }
          : { text: upcoming ? countdownLabel(t.startIso!) : 'Registered', color: c.sky };

  const price = Number.isNaN(t.listPrice) ? null : t.listPrice === 0 ? 'Free' : `₹${t.listPrice.toLocaleString('en-IN')}`;
  const canCalendar = !!t.eventSlug && upcoming && !cancelled;

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
            tintColor={c.primary}
            colors={[c.primary]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {/* ── The pass: what it's for, then the stub that gets scanned ── */}
        <View onLayout={(e) => setPassSize(e.nativeEvent.layout)}>
          {/* The sky shade, cut to the pass outline. It sits behind the content, so the
              QR's white panel is drawn above it, never under its grain. */}
          {passSize && notchY != null ? (
            <MaskedView
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              maskElement={<PassShape width={passSize.width} height={passSize.height} notchY={notchY} fill={c.text} />}
            >
              <ShadeCard tone="sky" style={StyleSheet.absoluteFill}>{null}</ShadeCard>
            </MaskedView>
          ) : null}
          <View style={styles.passTop} onLayout={(e) => setNotchY(e.nativeEvent.layout.height + NOTCH / 2)}>
            <View style={[styles.thumb, { backgroundColor: c.card }]}>
              {t.cover ? (
                <Image source={{ uri: t.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={styles.flex}>
              <View style={styles.badge}>
                {badge.tick ? (
                  <Check size={13} color={badge.color} weight="bold" />
                ) : (
                  <View style={[styles.badgeDot, { backgroundColor: badge.color }]} />
                )}
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
              </View>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{t.title}</Text>
            </View>
          </View>

          {/* Tear line between the notches PassShape cuts out of both edges */}
          <View style={styles.perfRow}>
            <View style={[styles.perf, { borderColor: c.outline }]} />
          </View>

          {t.ended ? (
            <EndedStub checkedIn={t.status === 'checkedIn'} />
          ) : (
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
              {t.code ? <Text style={[styles.code, { color: c.sky }]}>{t.code}</Text> : null}
              <Text style={[styles.hint, { color: c.soft }]}>
                {t.status === 'checkedIn' ? 'You are checked in. Enjoy the event.' : 'Show this at the entrance'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Facts: a date stub, then where, then what I hold ── */}
        <View style={styles.facts}>
          <CardBackdrop shape={styles.facts} />
          <Pressable
            onPress={canCalendar ? t.addToCalendar : undefined}
            disabled={!canCalendar}
            accessibilityRole="button"
            accessibilityLabel={`${when.weekday}, ${when.time}${canCalendar ? '. Add to calendar' : ''}`}
            style={({ pressed }) => [styles.factRow, pressed && { backgroundColor: c.tint }]}
          >
            <View style={styles.dateStub}>
              <Text style={[styles.stubMonth, { color: c.muted }]}>{when.month}</Text>
              <Text style={[styles.stubDay, { color: c.sky }]}>{when.day}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.factTitle, { color: c.text }]} numberOfLines={1}>{when.weekday}</Text>
              <Text style={[styles.factSub, { color: c.soft }]} numberOfLines={1}>{when.time}</Text>
            </View>
            {canCalendar ? <CalendarPlus size={ICON} color={c.text} /> : null}
          </Pressable>
          <Divider />
          <Fact
            icon={t.isOnline ? <Globe size={ICON} color={c.text} /> : <MapPin size={ICON} color={c.text} />}
            title={t.venue}
            sub={t.isOnline ? 'Online' : null}
          />
          {t.ticketTypeName ? (
            <>
              <Divider />
              <Fact icon={<TicketIcon size={ICON} color={c.sky} />} title={t.ticketTypeName} titleColor={c.sky} sub={price} />
            </>
          ) : null}
          {t.eventSlug ? (
            <>
              <Divider />
              <Pressable
                onPress={openEvent}
                accessibilityRole="link"
                style={({ pressed }) => [styles.factRow, pressed && { backgroundColor: c.tint }]}
              >
                <View style={styles.factIcon}>
                  <ArrowUpRight size={ICON} color={c.text} />
                </View>
                <Text style={[styles.factTitle, styles.flex, { color: c.text }]}>View event</Text>
                <CaretRight size={15} color={c.muted} />
              </Pressable>
            </>
          ) : null}
        </View>

        {eventLive && t.eventId ? <LivePollsPanel eventId={t.eventId} /> : null}
        {eventLive && t.eventId ? <LiveQaPanel eventId={t.eventId} /> : null}
        {eventLive && t.eventId ? <LiveQuizPanel eventId={t.eventId} /> : null}

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
                <Text style={[styles.reasonLabel, { color: c.muted }]}>Reason</Text>
                <Text style={[styles.reasonText, { color: c.text }]}>{t.cancellation.reason}</Text>
              </View>
            ) : null}
          </SettingsGroup>
        ) : null}

        {/* ── Actions ── */}
        {!cancelled ? (
          <SettingsGroup>
            {!t.ended ? (
              <SettingsRow
                icon={<ShareNetwork size={24} color={c.text} />}
                label="Share that I'm going"
                onPress={() => setShareOpen(true)}
              />
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
            {t.competition && t.eventId && !t.ended ? (
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
          </SettingsGroup>
        ) : null}

        {t.ended ? (
          <AfterEventGroup
            cert={cert}
            feedback={feedback && { ...feedback, onPress: () => router.push(`/feedback/${t.eventId}` as never) }}
            results={
              !t.eventId
                ? null
                : t.hackathon
                  ? { onPress: () => router.push(`/hackathon/${t.eventId}/results` as never) }
                  : t.competition
                    ? { value: t.competition.status, onPress: () => router.push(`/competition/${t.eventId}` as never) }
                    : null
            }
          />
        ) : null}

        {!cancelled && t.waGroup?.inviteUrl ? (
          <SettingsGroup title={`WhatsApp ${t.waGroup.isCommunity ? 'community' : 'group'}`}>
            <SettingsRow
              icon={<WhatsappLogo size={24} color={c.text} weight="fill" />}
              label={`Join the ${t.waGroup.isCommunity ? 'community' : 'group'}`}
              external
              onPress={t.openWhatsapp}
            />
            <SettingsRow
              icon={<CheckCircle size={24} color={t.waGroup.joined ? c.success : c.muted} weight={t.waGroup.joined ? 'fill' : 'regular'} />}
              label="I've joined"
              trailing={
                <Switch
                  value={!!t.waGroup.joined}
                  onValueChange={t.toggleJoinedWhatsapp}
                  disabled={t.waSaving}
                  trackColor={{ false: c.input, true: c.primary }}
                  thumbColor={t.waGroup.joined ? c.primaryFg : undefined}
                  ios_backgroundColor={c.input}
                />
              }
            />
          </SettingsGroup>
        ) : null}

        {t.checkins.length > 0 ? (
          <SettingsGroup title="Check-ins">
            {t.checkins.map((ci) => {
              const at = new Date(ci.checkedInAt);
              const when = `${at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${formatTime(at)}`;
              return (
                <SettingsRow
                  key={ci.id}
                  icon={<CheckCircle size={24} color={c.mint} weight="fill" />}
                  label={[ci.checkinType || 'Check-in', ci.checkedBy ? `by ${ci.checkedBy}` : null].filter(Boolean).join(' · ')}
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

function Divider() {
  const c = useCosmos();
  return <View style={[styles.divider, { backgroundColor: c.border }]} />;
}

/** One line of the facts card: bare icon, title, optional quieter line under it. */
function Fact({ icon, title, titleColor, sub }: { icon: React.ReactNode; title: string; titleColor?: string; sub?: string | null }) {
  const c = useCosmos();
  return (
    <View style={styles.factRow}>
      <View style={styles.factIcon}>{icon}</View>
      <View style={styles.flex}>
        <Text style={[styles.factTitle, { color: titleColor ?? c.text }]} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={[styles.factSub, { color: c.soft }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
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
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  passTop: { flexDirection: 'row', gap: spacing[4], alignItems: 'flex-start', padding: spacing[5] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  title: { marginTop: spacing[2], fontSize: 21, lineHeight: 27, ...cosmosFont.display },
  perfRow: { height: NOTCH, justifyContent: 'center' },
  perf: { marginHorizontal: NOTCH, borderTopWidth: 1, borderStyle: 'dashed' },
  stub: { alignItems: 'center', paddingTop: spacing[4], paddingBottom: spacing[6], paddingHorizontal: spacing[5] },
  // The QR keeps its white field: scanners need the contrast.
  qr: { padding: 14, borderRadius: borderRadius.md, backgroundColor: '#ffffff' },
  voidText: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  code: { marginTop: spacing[4], fontSize: 18, ...cosmosFont.figure, letterSpacing: 2 },
  hint: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  facts: { marginTop: spacing[4], borderRadius: cosmosCardRadius, overflow: 'hidden' },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] },
  // Same column as the date stub, so every line's text starts at one edge.
  factIcon: { width: STUB, alignItems: 'center' },
  dateStub: { width: STUB, alignItems: 'center', justifyContent: 'center' },
  stubMonth: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  stubDay: { fontSize: 24, lineHeight: 28, ...cosmosFont.figure },
  factTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  factSub: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing[4] + STUB + spacing[4] },
  reason: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 2 },
  reasonLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  reasonText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
  emptyTitle: { marginTop: spacing[4], fontSize: 20, ...cosmosFont.display },
});
