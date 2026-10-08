import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from '@unifesto/unicon/react-native';
import type { MyInvite } from '../../lib/api/registrations';
import { relativeWhen } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';

/**
 * "You've been invited" cards: seats someone booked for me in a group ticket,
 * still waiting to be claimed. A gentle nudge, never a gate: "View" opens the
 * claim screen (claim, decline or just look), ✕ declines it (after a confirm).
 */
export default function InviteCards({
  invites,
  onOpen,
  onDecline,
}: {
  invites: MyInvite[];
  onOpen: (token: string) => void;
  onDecline: (token: string) => void;
}) {
  const c = useCosmos();
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
              { backgroundColor: c.tint, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <View style={[styles.cover, { backgroundColor: c.card }]}>
              {coverOr(defaults, (inv.event as { id?: string }).id, inv.event.coverImageUrl) ? (
                <Image source={{ uri: coverOr(defaults, (inv.event as { id?: string }).id, inv.event.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={styles.body}>
              <Text style={[styles.kicker, { color: c.primary }]} numberOfLines={1}>
                {inv.invitedBy ? `${inv.invitedBy} saved you a seat` : 'You have a seat waiting'}
              </Text>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{inv.event.title}</Text>
              <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>
                {[relativeWhen(inv.event.startDateTime), where].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={[styles.view, { color: c.primary }]}>View</Text>
            <Pressable
              onPress={() => onDecline(inv.token)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Decline this invite"
              style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
            >
              <X size={16} color={c.muted} weight="bold" />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: cosmosCardRadius },
  // Event covers are 4:3.
  cover: { width: 72, height: 54, borderRadius: borderRadius.md, overflow: 'hidden' },
  body: { flex: 1, gap: 2 },
  kicker: { fontSize: 12, ...cosmosFont.strong },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  view: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  close: { padding: 4 },
});
