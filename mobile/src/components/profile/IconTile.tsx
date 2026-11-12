import React from 'react';
import { StyleSheet, View } from 'react-native';
import SystemGlyph, { type SystemGlyphProps } from './SystemGlyph';
import { SHADES, cosmosFor } from '../../theme/cosmos';

const day = cosmosFor('light');

/**
 * Solid tile fills, the same by day and night like iOS Settings: each Horizon
 * accent's deep shade, dark enough for a white glyph (4.2:1 ivory to 6:1 grey).
 * Change a tone here and every tile of that tone follows.
 */
const FILL = {
  sky: day.sky,
  mint: day.mint,
  blue: SHADES.dark.blue.s2,
  ivory: SHADES.dark.ivory.s2,
  crimson: day.danger,
  grey: day.muted,
} as const;

export type TileTone = keyof typeof FILL;

export interface IconTileProps extends Pick<SystemGlyphProps, 'sf' | 'glyph'> {
  tone: TileTone;
}

/**
 * Every Profile and Settings row's tile in one place: the SF Symbol, its Unicon
 * twin for Android, and the tone. Tones follow the row's job (sky tickets and
 * events, mint done and help, crimson alerts and sign out, grey plain settings).
 */
export const TILES = {
  saved: { sf: 'bookmark.fill', glyph: 'tag', tone: 'sky' },
  certificates: { sf: 'rosette', glyph: 'certificate', tone: 'mint' },
  spaces: { sf: 'person.3.fill', glyph: 'users-three', tone: 'blue' },
  photo: { sf: 'camera.fill', glyph: 'image-square', tone: 'sky' },
  bio: { sf: 'pencil', glyph: 'pencil-simple', tone: 'sky' },
  openSpace: { sf: 'building.2.fill', glyph: 'buildings', tone: 'blue' },
  startSpace: { sf: 'plus', glyph: 'plus', tone: 'sky' },
  hostEvent: { sf: 'calendar.badge.plus', glyph: 'calendar-plus', tone: 'sky' },
  settings: { sf: 'gearshape.fill', glyph: 'gear', tone: 'grey' },
  account: { sf: 'person.fill', glyph: 'user', tone: 'sky' },
  notifications: { sf: 'bell.badge.fill', glyph: 'bell', tone: 'crimson' },
  permissions: { sf: 'hand.raised.fill', glyph: 'lock-simple', tone: 'blue' },
  appearance: { sf: 'circle.lefthalf.filled', glyph: 'circle-half', tone: 'grey' },
  support: { sf: 'lifepreserver.fill', glyph: 'lifebuoy', tone: 'mint' },
  whatsNew: { sf: 'sparkles', glyph: 'sparkle', tone: 'blue' },
  about: { sf: 'arrow.triangle.2.circlepath', glyph: 'arrows-clockwise', tone: 'grey' },
  rate: { sf: 'star.fill', glyph: 'star', tone: 'ivory' },
  signOut: { sf: 'rectangle.portrait.and.arrow.right', glyph: 'sign-out', tone: 'crimson' },
} as const satisfies Record<string, IconTileProps>;

/**
 * A row glyph on a coloured rounded square (Profile and Settings only; every
 * other list keeps bare glyphs). Sized to SettingsRow's 30pt icon slot.
 */
export default function IconTile({ sf, glyph, tone }: IconTileProps) {
  return (
    <View style={[styles.tile, { backgroundColor: FILL[tone] }]}>
      <SystemGlyph sf={sf} glyph={glyph} size={17} color={day.primaryFg} />
    </View>
  );
}

const styles = StyleSheet.create({
  // iOS Settings proportions: a ~23% corner on a continuous curve.
  tile: { width: 30, height: 30, borderRadius: 7, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
});
