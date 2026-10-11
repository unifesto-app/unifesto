import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarBlank, MapPin } from '@unifesto/unicon/react-native';
import Skeleton from '../Skeleton';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import PressableScale from '../ui/PressableScale';

export const POSTER_WIDTH = 220;

export interface PosterCardProps {
  title: string;
  imageUrl?: string | null;
  /** Date line, e.g. "Sat · 6:30 PM". */
  when: string;
  /** Venue, city or platform. */
  where?: string | null;
  /** Who runs it (space name), under the title. */
  host?: string | null;
  /** Tag on the cover's bottom-left, e.g. the primary category. */
  tag?: string | null;
  price?: string;
  width?: number;
  onPress: () => void;
}

/**
 * The one card for anything with a date, modelled on the web's EventCard:
 * a raised card with the 4:3 cover on top (category tag in its corner), then
 * title, host, date and place with icons, and the price last.
 */
export default function PosterCard({
  title,
  imageUrl,
  when,
  where,
  host,
  tag,
  price,
  width = POSTER_WIDTH,
  onPress,
}: PosterCardProps) {
  const c = useCosmos();
  // Large text: a fixed-width card would cut titles to a word or two.
  const titleLines = useWindowDimensions().fontScale > 1.3 ? 3 : 2;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, host, when, where, price].filter(Boolean).join(', ')}
      style={[styles.card, { width, backgroundColor: c.raised }]}
    >
      <View style={[styles.cover, { backgroundColor: c.card }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.fallback]}>
            <Text style={[styles.fallbackText, { color: c.muted }]}>{title.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
        {tag ? <CoverTag label={tag} style={styles.tag} /> : null}
      </View>

      <View style={styles.body}>
        <View>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={titleLines}>{title}</Text>
          {host ? <Text style={[styles.host, { color: c.muted }]} numberOfLines={1}>{host}</Text> : null}
        </View>
        <View style={styles.metaBlock}>
          <MetaLine icon={<CalendarBlank size={13} color={c.soft} />} text={when} />
          {where ? <MetaLine icon={<MapPin size={13} color={c.soft} />} text={where} /> : null}
        </View>
        {price ? <Text style={[styles.price, { color: c.text }]}>{price}</Text> : null}
      </View>
    </PressableScale>
  );
}

function MetaLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  const c = useCosmos();
  return (
    <View style={styles.metaLine}>
      {icon}
      <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/**
 * Small label sitting on a cover image (the web's blur-bg pill). A solid
 * scrim, not glass: glass on event banners was tried and rejected.
 */
export function CoverTag({ label, style }: { label: string; style?: object }) {
  return (
    <View style={[styles.coverTag, style]}>
      <Text style={styles.coverTagText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function PosterCardSkeleton({ width = POSTER_WIDTH }: { width?: number }) {
  const c = useCosmos();
  return (
    <View style={[styles.card, { width, backgroundColor: c.raised }]}>
      <Skeleton width={width} height={(width * 3) / 4} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width={width * 0.8} height={16} borderRadius={6} />
        <Skeleton width={width * 0.45} height={11} borderRadius={6} />
        <Skeleton width={width * 0.6} height={12} borderRadius={6} />
        <Skeleton width={width * 0.3} height={12} borderRadius={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontSize: 36, ...cosmosFont.display },
  tag: { position: 'absolute', left: spacing[3], bottom: spacing[3] },
  coverTag: {
    alignSelf: 'flex-start',
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  coverTagText: { fontSize: 11, color: '#ffffff', ...cosmosFont.strong },
  body: { flex: 1, padding: spacing[4], gap: spacing[3] },
  title: { fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.3, ...cosmosFont.strong },
  host: { marginTop: 3, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  metaBlock: { gap: 5 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  // Pinned to the bottom so prices line up across a rail of uneven titles.
  price: { marginTop: 'auto', fontSize: typography.fontSize.base, ...cosmosFont.strong },
});
