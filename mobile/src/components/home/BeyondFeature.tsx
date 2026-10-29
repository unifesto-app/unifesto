import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CaretRight } from '@unifesto/unicon/react-native';
import type { Space } from '../../lib/api/spaces';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import Skeleton from '../Skeleton';
import { spaceBanner, spaceLogo, spaceMembers } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';
import { logoOr, useDefaultImages } from '../../lib/defaultImages';
import PressableScale from '../ui/PressableScale';

// Space banner is 4:3 and the logo 1:1; both kept thumbnail-sized so the
// feature reads as one compact row, not another full-width block.
const BANNER_W = 116;
const BANNER_H = (BANNER_W * 3) / 4;
const LOGO = 34;

/** Featured partner row ("Beyond by Unifesto"), accent-tinted to stand apart. */
export default function BeyondFeature({ space, onPress }: { space: Space; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const banner = spaceBanner(space);
  const logo = logoOr(defaults, space.id, spaceLogo(space));
  const events = space.event_count || space._count?.events || 0;
  const meta = [`${spaceMembers(space)} members`, `${events} events`].join(' · ');

  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={space.name}
        style={styles.card}
      >
        <CardBackdrop shape={styles.card} />
        <LinearGradient
          colors={[c.tint, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View>
          <View style={[styles.banner, { backgroundColor: c.card }]}>
            {banner ? (
              <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
          </View>
          <View style={[styles.logo, { borderColor: c.card, backgroundColor: c.card }]}>
            {logo ? (
              <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} style={[StyleSheet.absoluteFill, styles.center]}>
                <Text style={[styles.logoText, { color: c.text }]}>{space.name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.eyebrow, { color: c.primary }]}>Featured space</Text>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{space.name}</Text>
          <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>{meta}</Text>
        </View>
        <CaretRight size={16} color={c.soft} weight="bold" />
      </PressableScale>
    </View>
  );
}

/** Same row footprint as the feature card: banner thumb + three text lines. */
export function BeyondFeatureSkeleton() {
  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.card}>
        <CardBackdrop shape={styles.card} />
        <Skeleton width={BANNER_W} height={BANNER_H} borderRadius={borderRadius.md} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width={88} height={10} borderRadius={5} />
          <Skeleton width="85%" height={16} borderRadius={6} />
          <Skeleton width="60%" height={10} borderRadius={5} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[3],
    paddingRight: spacing[4],
    borderRadius: cosmosCardRadius,
    overflow: 'hidden',
  },
  banner: { width: BANNER_W, height: BANNER_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  logo: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: LOGO + 4,
    height: LOGO + 4,
    borderRadius: borderRadius.sm + 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 13, ...cosmosFont.strong },
  eyebrow: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  name: { fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.2, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
