import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Event } from '../../lib/api/events';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import { relativeWhen, shortPrice } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import PressableScale from '../ui/PressableScale';

const MAX = 5;

/**
 * Ranked "Trending now" list: a DM Sans 01–05 index (the web's instrument
 * numerals), a 4:3 thumb, title and date · price. Vertical on purpose, so it
 * breaks up the run of horizontal rails.
 */
export default function TrendingList({ events, onPress }: { events: Event[]; onPress: (e: Event) => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();

  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      {events.slice(0, MAX).map((e, i) => {
        const cover = coverOr(defaults, e.id, e.coverImageUrl);
        return (
          <PressableScale feedback="inline"
            key={e.id}
            onPress={() => onPress(e)}
            accessibilityRole="button"
            accessibilityLabel={`Number ${i + 1}, ${e.title}, ${relativeWhen(e.startDateTime)}, ${shortPrice(e)}`}
            style={[
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
            ]}
          >
            <Text style={[styles.rank, { color: i === 0 ? c.text : c.muted }]}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={[styles.thumb, { backgroundColor: c.card }]}>
              {cover ? (
                <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{e.title}</Text>
              <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
                {relativeWhen(e.startDateTime)}
                <Text style={styles.price}>{`  ·  ${shortPrice(e)}`}</Text>
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingVertical: spacing[3] },
  rank: { width: 30, fontSize: 15, ...cosmosFont.figure },
  // Event covers are 4:3.
  thumb: { width: 76, height: 57, borderRadius: borderRadius.md, overflow: 'hidden' },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  price: { ...cosmosFont.figure },
});
