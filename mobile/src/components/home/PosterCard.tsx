import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../../context/ThemeContext';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export const POSTER_WIDTH = 196;

export interface PosterCardProps {
  title: string;
  imageUrl?: string | null;
  /** First metadata line, e.g. "Sat · 6:30 PM". */
  when: string;
  /** Second metadata line, e.g. venue, platform or host. */
  where?: string | null;
  price?: string;
  width?: number;
  onPress: () => void;
}

/**
 * The one card for anything with a date: events, sessions, shortlist items.
 * Clean 4:3 cover, then title → when → where, price last in accent.
 */
export default function PosterCard({
  title,
  imageUrl,
  when,
  where,
  price,
  width = POSTER_WIDTH,
  onPress,
}: PosterCardProps) {
  const tokens = useTokens();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${when}`}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[styles.cover, { backgroundColor: tokens.elevated }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.fallback]}>
            <Text style={styles.fallbackText}>{title.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
          {when}
        </Text>
        {where ? (
          <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {price ? <Text style={[styles.price, { color: tokens.accent }]}>{price}</Text> : null}
      </View>
    </Pressable>
  );
}

export function PosterCardSkeleton({ width = POSTER_WIDTH }: { width?: number }) {
  return (
    <View style={{ width }}>
      <Skeleton width={width} height={(width * 3) / 4} borderRadius={borderRadius.xl} />
      <View style={styles.body}>
        <Skeleton width={width * 0.85} height={16} borderRadius={6} />
        <Skeleton width={width * 0.55} height={12} borderRadius={6} style={{ marginTop: 8 }} />
        <Skeleton width={width * 0.4} height={12} borderRadius={6} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontSize: 40, color: '#ffffff', ...font('heading') },
  body: { paddingTop: spacing[3], paddingHorizontal: 2, gap: 3 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.3, marginBottom: 2, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, ...font() },
  price: { fontSize: typography.fontSize.sm, marginTop: 3, ...font('semibold') },
});
