import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import type { MyInvite } from '../../lib/api/registrations';
import { relativeWhen } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { GUTTER } from './Section';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';

const TINT = 'rgba(52,145,255,0.14)';

/**
 * "You've been invited" cards: seats someone booked for me in a group ticket,
 * still waiting to be claimed. A gentle nudge, never a gate: "View" opens the
 * claim screen (claim, decline or just look), ✕ hides the card.
 */
export default function InviteCards({
  invites,
  onOpen,
  onDismiss,
}: {
  invites: MyInvite[];
  onOpen: (token: string) => void;
  onDismiss: (token: string) => void;
}) {
  const tokens = useTokens();
  const defaults = useDefaultImages();
  if (invites.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: GUTTER, gap: spacing[3] }}>
      {invites.slice(0, 3).map((inv) => {
        const where = inv.event.venueName || inv.event.city;
        return (
          <Pressable
            key={inv.token}
            onPress={() => onOpen(inv.token)}
            accessibilityRole="button"
            accessibilityLabel={`Seat invite for ${inv.event.title}`}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: LIQUID_GLASS ? undefined : TINT, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <GlassFill radius={borderRadius.xl} tint={TINT} interactive />
            <View style={[styles.cover, { backgroundColor: tokens.elevated }]}>
              {coverOr(defaults, (inv.event as { id?: string }).id, inv.event.coverImageUrl) ? (
                <Image source={{ uri: coverOr(defaults, (inv.event as { id?: string }).id, inv.event.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={styles.body}>
              <Text style={[styles.kicker, { color: tokens.accent }]} numberOfLines={1}>
                {inv.invitedBy ? `${inv.invitedBy} saved you a seat` : 'You have a seat waiting'}
              </Text>
              <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{inv.event.title}</Text>
              <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
                {[relativeWhen(inv.event.startDateTime), where].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={[styles.view, { color: tokens.accent }]}>View</Text>
            <Pressable
              onPress={() => onDismiss(inv.token)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Hide this invite"
              style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
            >
              <X size={16} color={tokens.textMuted} weight="bold" />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: borderRadius.xl },
  // Event covers are 4:3.
  cover: { width: 72, height: 54, borderRadius: borderRadius.md, overflow: 'hidden' },
  body: { flex: 1, gap: 2 },
  kicker: { fontSize: 12, ...font('semibold') },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, ...font() },
  view: { fontSize: typography.fontSize.sm, ...font('semibold') },
  close: { padding: 4 },
});
