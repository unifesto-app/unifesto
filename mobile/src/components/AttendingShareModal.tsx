import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
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
import { ShareNetwork, UserCircle, X } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';
import UnifestoAppWordmark from './UnifestoAppWordmark';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from './ui/CardSurface';
import { cosmosFont, cosmosFor, cosmosRadius, useCosmos } from '../theme/cosmos';
import Modal from './ui/Modal';

/** Event fields the share card needs — resolved by the caller from whatever
 *  shape it has (event detail, ticket, etc.). */
export interface AttendingEvent {
  title: string;
  /** Pre-formatted, human date, e.g. "12 Oct 2026". */
  dateLabel?: string | null;
  /** ISO start time: the date line when `dateLabel` is missing (display
   *  strings like "12 Oct 2026" don't parse reliably on Hermes). */
  startIso?: string | null;
  /** Venue name or city. */
  venueLabel?: string | null;
  /** Event cover/banner image (4:3). Falls back to the brand gradient. */
  bannerUrl?: string | null;
  /** Organiser space logo (1:1). Shown on the banner only when present. */
  spaceLogoUrl?: string | null;
  /** Approved white-label accent (hex). Recolours the shared image's glow and
   *  "I'm going" dot so it carries the organiser's brand. */
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

// The artwork is its own night canvas (it leaves the app as a PNG, the same in
// light and dark mode), so it always takes the Horizon night tokens.
const NIGHT = cosmosFor('dark');
const CANVAS = NIGHT.bg;
const RAISED = NIGHT.raised;
const INK = NIGHT.text;
const SOFT = NIGHT.soft;
const DEFAULT_ACCENT = NIGHT.primary;
const DEFAULT_ACCENT_DEEP = NIGHT.muted;

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
 * The exported pixels. Night canvas with one glow of the accent, wordmark and
 * a plain "I'm going" up top, the event's clean 4:3 banner (1:1 space logo in
 * its corner), title, date and place, then the attendee. Everything is plain
 * views, gradients and SVG, so react-native-view-shot captures it exactly as shown.
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
  const dateLine =
    event.dateLabel ||
    (date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

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
          <View style={cardStyles.going}>
            <View style={[cardStyles.goingDot, { backgroundColor: accent }]} />
            <Text style={[cardStyles.goingText, { fontSize: compact ? 11 : 12 }]}>I'm going</Text>
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
          {dateLine || event.venueLabel ? (
            <Text style={[cardStyles.meta, { fontSize: compact ? 12 : 13 }]} numberOfLines={2}>
              {[dateLine, event.venueLabel].filter(Boolean).join('  ·  ')}
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
  // A status, so plain text with a dot, never a pill.
  going: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goingDot: { width: 6, height: 6, borderRadius: 3 },
  goingText: { color: INK, ...cosmosFont.strong },
  banner: { borderRadius: borderRadius.md, overflow: 'hidden', backgroundColor: RAISED },
  logo: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: RAISED,
  },
  title: { color: INK, ...cosmosFont.display },
  meta: { color: SOFT, marginTop: 6, ...cosmosFont.body },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, backgroundColor: RAISED },
  name: { color: INK, ...cosmosFont.strong },
  handle: { color: SOFT, fontSize: 12, marginTop: 1, ...cosmosFont.body },
  site: { color: SOFT, fontSize: 11, ...cosmosFont.strong },
});

/** Two-option segmented switch with a sliding thumb (Story / Post). */
function FormatSwitch({ value, onChange }: { value: ShareFormatKey; onChange: (k: ShareFormatKey) => void }) {
  const c = useCosmos();
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
      style={modalStyles.switch}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      <CardBackdrop shape={modalStyles.switch} />
      {segW > 0 ? <Animated.View style={[modalStyles.switchPill, { width: segW, backgroundColor: c.text }, pill]} /> : null}
      {SHARE_FORMATS.map((f) => {
        const active = f.key === value;
        return (
          <Pressable key={f.key} onPress={() => onChange(f.key)} style={modalStyles.switchSeg} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={[modalStyles.switchText, { color: active ? c.bg : c.soft }]}>{f.label}</Text>
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
  const c = useCosmos();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

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
      <View style={[modalStyles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} hitSlop={10} style={modalStyles.close} accessibilityRole="button" accessibilityLabel="Close">
            <X size={24} color={c.text} weight="bold" />
          </Pressable>
          <Text style={[modalStyles.headerTitle, { color: c.text }]} accessibilityRole="header">Share that I'm going</Text>
          <View style={modalStyles.close} />
        </View>

        {!complete ? (
          <View style={modalStyles.gate}>
            <UserCircle size={56} color={c.text} weight="duotone" />
            <Text style={[modalStyles.gateTitle, { color: c.text }]} accessibilityRole="header">Add your name and photo</Text>
            <Text style={[modalStyles.gateBody, { color: c.muted }]}>
              Both appear on the card you share. Add them, then come back to post it.
            </Text>
            <Button label="Edit profile" size="lg" fullWidth onPress={goToProfile} style={{ marginTop: spacing[5], alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={modalStyles.body} showsVerticalScrollIndicator={false}>
              <View style={modalStyles.preview}>
                <View style={{ borderRadius: cosmosRadius, overflow: 'hidden' }}>
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
              {error ? <Text style={[modalStyles.error, { color: c.danger }]}>{error}</Text> : null}
            </ScrollView>

            <View style={[modalStyles.footer, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
              {/* The primary: silver by night, ink by day (never the brand colour). */}
              <Button
                label={sharing ? 'Creating image…' : ready ? 'Share' : 'Preparing…'}
                size="lg"
                fullWidth
                icon={<ShareNetwork size={20} color={c.primaryFg} weight="bold" />}
                disabled={!ready || sharing}
                onPress={handleShare}
              />
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
  headerTitle: { fontSize: 17, ...cosmosFont.strong },
  body: { alignItems: 'center', paddingHorizontal: spacing[6], paddingTop: spacing[4], paddingBottom: spacing[6], gap: spacing[6] },
  preview: { borderRadius: cosmosRadius },
  switch: { flexDirection: 'row', padding: 4, borderRadius: cosmosRadius, width: 220 },
  switchPill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: cosmosRadius - 4 },
  switchSeg: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  error: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  footer: { paddingHorizontal: spacing[6], paddingTop: spacing[3] },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8], paddingBottom: spacing[16], gap: spacing[2] },
  gateTitle: { marginTop: spacing[3], fontSize: 22, lineHeight: 28, textAlign: 'center', ...cosmosFont.display },
  gateBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', maxWidth: 300, ...cosmosFont.body },
});
