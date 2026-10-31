import React from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';

const TILE = 180;
const GRAIN = require('../../../assets/brand/grain-180.png');
const GRAIN_INK = require('../../../assets/brand/grain-180-ink.png');

/**
 * Film grain: the brand's 180pt tile laid out in a grid over the screen (the
 * parent clips what falls past its edge). Image's resizeMode="repeat" drew only
 * one tile on the New Architecture, a visible box in the top-left corner.
 */
export default function Grain({ dark, opacity }: { dark: boolean; opacity: number }) {
  const { width, height } = useWindowDimensions();
  const cols = Math.ceil(width / TILE);
  const count = cols * Math.ceil(height / TILE);
  return (
    <View pointerEvents="none" style={[styles.grid, { width: cols * TILE, opacity }]}>
      {Array.from({ length: count }, (_, i) => (
        <Image key={i} source={dark ? GRAIN : GRAIN_INK} style={styles.tile} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { position: 'absolute', top: 0, left: 0, flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: TILE, height: TILE },
});
