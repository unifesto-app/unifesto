import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ShareNetwork, UserCircle, X } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';
import UnifestoAppWordmark from './UnifestoAppWordmark';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

/** Event fields the share card needs — resolved by the caller from whatever
 *  shape it has (event detail, ticket, etc.). */
export interface AttendingEvent {
  title: string;
  /** Pre-formatted, human date, e.g. "12 Oct 2026". */
  dateLabel?: string | null;
  /** ISO start time — drives the date chip on the banner (display strings
   *  like "12 Oct 2026" don't parse reliably on Hermes). */
  startIso?: string | null;
  /** Venue name or city. */
  venueLabel?: string | null;
  /** Event cover/banner image (4:3). Falls back to the brand gradient. */
  bannerUrl?: string | null;
  /** Organiser space logo (1:1). Shown on the banner only when present. */
  spaceLogoUrl?: string | null;
  /** Approved white-label accent (hex). Recolours the card glow, chip and
   *  button so the shared image carries the organiser's brand. */
  brandColor?: string | null;
}

/** A profile is share-ready only with a non-empty name AND an avatar. */
export function isProfileComplete(user: {
  fullName?: string | null;
  avatarUrl?: string | null;
} | null | undefined): boolean {
  return !!(user?.fullName?.trim() && user?.avatarUrl?.trim());
}

export type ShareFormatKey = 'story' | 'post';

export interface ShareFormat {
  key: ShareFormatKey;
  label: string;
  short: string;
  /** width / height of the exported image. */
  ratio: number;
  orientation: 'portrait' | 'landscape';
}

/** Formats offered before sharing. */
export const SHARE_FORMATS: ShareFormat[] = [
  { key: 'story', label: 'Story', short: 'Story', ratio: 9 / 16, orientation: 'portrait' },
  { key: 'post', label: 'Post', short: 'Post', ratio: 3 / 4, orientation: 'portrait' },
];

// The artwork is its own dark canvas (it leaves the app as a PNG), so its
// colours are fixed rather than theme tokens.
const CANVAS = '#050505';
const INK = '#ffffff';
const SOFT = 'rgba(255,255,255,0.62)';
const DEFAULT_ACCENT = '#3491ff';
const DEFAULT_ACCENT_DEEP = '#0062ff';

interface CardProps {
  width: number;
  height: number;
  event: AttendingEvent;
  userName: string;
  username?: string | null;
  avatarUrl: string;
  onBannerReady: () => void;
  onAvatarReady: () => void;
  onLogoReady: () => void;
}

/**
 * The exported pixels. Dark canvas with one glow of the accent, wordmark and
 * "I'm going" chip up top, the event's 4:3 banner (date chip + 1:1 space logo),
 * title and details, then the attendee. Everything is plain views, gradients
 * and SVG, so react-native-view-shot captures it exactly as shown.
 */
const AttendingCard = forwardRef<View, CardProps>(function AttendingCard(
  { width, height, event, userName, username, avatarUrl, onBannerReady, onAvatarReady, onLogoReady },
  ref,
) {
  const accent = event.brandColor || DEFAULT_ACCENT;
  const accentDeep = event.brandColor || DEFAULT_ACCENT_DEEP;
  // Post (3:4) has much less height than Story (9:16): tighten type and gaps.
  const compact = height / width < 1.5;
  const pad = Math.round(width * 0.07);
  const innerW = width - pad * 2;
  const bannerW = compact ? Math.round(innerW * 0.86) : innerW;
  const bannerH = Math.round((bannerW * 3) / 4); // event banners are 4:3
  const titleSize = compact ? 18 : 22;
  const date = event.startIso ? new Date(event.startIso) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;

  return (
    <View ref={ref} collapsable={false} style={{ width, height, backgroundColor: CANVAS, overflow: 'hidden' }}>
      {/* One glow of the accent from the top — the card's only colour field */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <RadialGradient id="cardGlow" cx="50%" cy="0%" rx="90%" ry="55%" fx="50%" fy="0%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.45} />
            <Stop offset="0.55" stopColor={accentDeep} stopOpacity={0.1} />
            <Stop offset="1" stopColor={CANVAS} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#cardGlow)" />
      </Svg>

      <View style={{ flex: 1, padding: pad, justifyContent: 'space-between' }}>
        <View style={cardStyles.topRow}>
          <UnifestoAppWordmark width={compact ? 84 : 100} height={compact ? 24 : 30} />
          <View style={[cardStyles.chip, { backgroundColor: accent }]}>
            <Text style={[cardStyles.chipText, { fontSize: compact ? 11 : 12 }]}>I'm going</Text>
          </View>
        </View>

        <View style={{ alignSelf: 'center', width: bannerW }}>
          <View style={[cardStyles.banner, { width: bannerW, height: bannerH }]}>
            {event.bannerUrl ? (
              <Image
                source={{ uri: event.bannerUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                onLoad={onBannerReady}
                onError={onBannerReady}
              />
            ) : (
              <LinearGradient colors={[accent, accentDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            {validDate ? (
              <View style={cardStyles.dateChip}>
                <Text style={cardStyles.dateDay}>{validDate.getDate()}</Text>
                <Text style={cardStyles.dateMonth}>{validDate.toLocaleDateString('en-IN', { month: 'short' })}</Text>
              </View>
            ) : null}
            {event.spaceLogoUrl ? (
              <Image
                source={{ uri: event.spaceLogoUrl }}
                style={[cardStyles.logo, compact && { width: 34, height: 34 }]}
                contentFit="cover"
                onLoad={onLogoReady}
                onError={onLogoReady}
              />
            ) : null}
          </View>

          <Text
            style={[cardStyles.title, { fontSize: titleSize, lineHeight: titleSize * 1.18, marginTop: compact ? 12 : 18 }]}
            numberOfLines={compact ? 2 : 3}
          >
            {event.title}
          </Text>
          {event.dateLabel || event.venueLabel ? (
            <Text style={[cardStyles.meta, { fontSize: compact ? 12 : 13 }]} numberOfLines={2}>
              {[event.dateLabel, event.venueLabel].filter(Boolean).join('  ·  ')}
            </Text>
          ) : null}
        </View>

        <View style={cardStyles.userRow}>
          <Image
            source={{ uri: avatarUrl }}
            style={[cardStyles.avatar, compact && { width: 38, height: 38, borderRadius: 19 }, { borderColor: accent }]}
            onLoad={onAvatarReady}
            onError={onAvatarReady}
          />
          <View style={{ flex: 1 }}>
            <Text style={[cardStyles.name, { fontSize: compact ? 14 : 16 }]} numberOfLines={1}>{userName}</Text>
            {username ? <Text style={cardStyles.handle} numberOfLines={1}>@{username}</Text> : null}
          </View>
          <Text style={cardStyles.site}>unifesto.app</Text>
        </View>
      </View>
    </View>
  );
});

const cardStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  chipText: { color: '#ffffff', ...font('semibold') },
  banner: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#141414' },
  dateChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    minWidth: 44,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
  },
  dateDay: { fontSize: 18, lineHeight: 20, color: INK, ...font('heading') },
  dateMonth: { fontSize: 10, color: SOFT, ...font('semibold') },
  logo: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#141414',
  },
  title: { color: INK, letterSpacing: -0.3, ...font('heading') },
  meta: { color: SOFT, marginTop: 6, ...font() },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, backgroundColor: '#141414' },
  name: { color: INK, ...font('semibold') },
  handle: { color: SOFT, fontSize: 12, marginTop: 1, ...font() },
  site: { color: SOFT, fontSize: 11, ...font('medium') },
});

/** Two-option switch with a sliding pill (Story / Post). */
function FormatSwitch({ value, onChange }: { value: ShareFormatKey; onChange: (k: ShareFormatKey) => void }) {
  const tokens = useTokens();
  const [w, setW] = useState(0);
  const segW = w > 0 ? (w - 8) / SHARE_FORMATS.length : 0;
  const x = useSharedValue(0);
  const index = SHARE_FORMATS.findIndex((f) => f.key === value);
  useEffect(() => {
    x.value = withSpring(index * segW, { damping: 20, stiffness: 220 });
  }, [index, segW, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      style={[modalStyles.switch, { backgroundColor: tokens.elevated }]}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segW > 0 ? <Animated.View style={[modalStyles.switchPill, { width: segW, backgroundColor: tokens.text }, pill]} /> : null}
      {SHARE_FORMATS.map((f) => {
        const active = f.key === value;
        return (
          <Pressable key={f.key} onPress={() => onChange(f.key)} style={modalStyles.switchSeg} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={[modalStyles.switchText, { color: active ? tokens.bg : tokens.textSecondary }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "I'm going" — a shareable card for ticket holders. Needs a name AND a photo
 * (both are on the card); otherwise it routes to Edit profile. The card is
 * captured to a PNG (react-native-view-shot) once its images have painted and
 * handed to the OS share sheet (expo-sharing), so it lands as a real image.
 */
export default function AttendingShareModal({
  visible,
  onClose,
  event,
}: {
  visible: boolean;
  onClose: () => void;
  event: AttendingEvent;
}) {
  const tokens = useTokens();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const accent = event.brandColor || tokens.accent;

  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [formatKey, setFormatKey] = useState<ShareFormatKey>('story');
  const complete = isProfileComplete(user);

  // Don't capture until remote images have painted, or the PNG comes out
  // half-empty. Banner and logo are optional (ready at once when absent).
  const [bannerReady, setBannerReady] = useState(!event.bannerUrl);
  const [avatarReady, setAvatarReady] = useState(false);
  const [logoReady, setLogoReady] = useState(!event.spaceLogoUrl);
  const ready = bannerReady && avatarReady && logoReady;

  // Preview sized to fit the screen: width-capped, and a Story preview is
  // also height-capped so the switch + button stay on screen.
  const format = SHARE_FORMATS.find((f) => f.key === formatKey) ?? SHARE_FORMATS[0];
  const maxH = screenH - insets.top - insets.bottom - 260;
  const cardWidth = Math.round(Math.min(screenW - spacing[6] * 2, 320, maxH * format.ratio));
  const cardHeight = Math.round(cardWidth / format.ratio);

  const handleShare = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    setError('');
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        setError('Sharing isn’t available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `I'm going to ${event.title}`,
        UTI: 'public.png',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the image.');
    } finally {
      setSharing(false);
    }
  };

  const goToProfile = () => {
    onClose();
    router.push('/edit-profile');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[modalStyles.screen, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} hitSlop={10} style={modalStyles.close} accessibilityRole="button" accessibilityLabel="Close">
            <X size={24} color={tokens.text} weight="bold" />
          </Pressable>
          <Text style={[modalStyles.headerTitle, { color: tokens.text }]}>Share that I'm going</Text>
          <View style={modalStyles.close} />
        </View>

        {!complete ? (
          <View style={modalStyles.gate}>
            <UserCircle size={56} color={accent} weight="duotone" />
            <Text style={[modalStyles.gateTitle, { color: tokens.text }]}>Add your name and photo</Text>
            <Text style={[modalStyles.gateBody, { color: tokens.textMuted }]}>
              Both appear on the card you share. Add them, then come back to post it.
            </Text>
            <Button label="Edit profile" size="lg" fullWidth onPress={goToProfile} style={{ marginTop: spacing[5], alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={modalStyles.body} showsVerticalScrollIndicator={false}>
              <View style={modalStyles.previewShadow}>
                <View style={{ borderRadius: 14, overflow: 'hidden' }}>
                  <AttendingCard
                    ref={cardRef}
                    width={cardWidth}
                    height={cardHeight}
                    event={event}
                    userName={(user?.fullName || '').trim()}
                    username={user?.username}
                    avatarUrl={user?.avatarUrl as string}
                    onBannerReady={() => setBannerReady(true)}
                    onAvatarReady={() => setAvatarReady(true)}
                    onLogoReady={() => setLogoReady(true)}
                  />
                </View>
              </View>
              <FormatSwitch value={formatKey} onChange={setFormatKey} />
              {error ? <Text style={[modalStyles.error, { color: tokens.danger }]}>{error}</Text> : null}
            </ScrollView>

            <View style={[modalStyles.footer, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
              <Pressable
                onPress={handleShare}
                disabled={!ready || sharing}
                accessibilityRole="button"
                style={({ pressed }) => [
                  modalStyles.shareBtn,
                  { backgroundColor: accent, opacity: !ready || sharing ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                <ShareNetwork size={20} color="#ffffff" weight="bold" />
                <Text style={modalStyles.shareText}>{sharing ? 'Creating image…' : ready ? 'Share' : 'Preparing…'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    height: 52,
  },
  close: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, ...font('semibold') },
  body: { alignItems: 'center', paddingHorizontal: spacing[6], paddingTop: spacing[4], paddingBottom: spacing[6], gap: spacing[6] },
  previewShadow: {
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  switch: { flexDirection: 'row', padding: 4, borderRadius: borderRadius.full, width: 220 },
  switchPill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: borderRadius.full },
  switchSeg: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  error: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  footer: { paddingHorizontal: spacing[6], paddingTop: spacing[3] },
  shareBtn: {
    height: 54,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  shareText: { color: '#ffffff', fontSize: typography.fontSize.base, ...font('semibold') },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8], paddingBottom: spacing[16], gap: spacing[2] },
  gateTitle: { marginTop: spacing[3], fontSize: typography.fontSize.xl, textAlign: 'center', ...font('heading') },
  gateBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', maxWidth: 300, ...font() },
});
