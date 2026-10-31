import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { CheckCircle, Circle } from '@unifesto/unicon/react-native';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { GUTTER, Section } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { APP_ICONS, appIconsSupported, currentAppIcon, setAppIcon, type AppIconName } from '../lib/appIcon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFor, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const ICON_COLUMNS = 4;

/**
 * Profile › Appearance: pick a theme by what it looks like. Each option is a
 * miniature screen drawn in that theme's own cosmos colours; System shows both
 * halves, since it follows the phone. Below it, the home-screen icon (only on
 * builds that carry the alternate-icons module).
 */
export default function AppearanceScreen() {
  const { theme, activeTheme, setTheme } = useTheme();
  const c = useCosmos();
  const topSpacing = useTopSpacing();

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Theme" subtitle="How Unifesto looks on this phone" style={styles.firstSection}>
          <View style={styles.options} accessibilityRole="radiogroup">
            {OPTIONS.map(({ key, label }) => {
              const selected = theme === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTheme(key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={key === 'system' ? `System, ${activeTheme} right now` : label}
                  style={({ pressed }) => [styles.option, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                >
                  <View style={[styles.frame, { backgroundColor: selected ? c.primary : 'transparent' }]}>
                    {key === 'system' ? (
                      <View style={styles.split}>
                        <View style={styles.half}><Preview scheme="dark" side="left" /></View>
                        <View style={styles.half}><Preview scheme="light" side="right" /></View>
                      </View>
                    ) : (
                      <Preview scheme={key} />
                    )}
                  </View>
                  <View style={styles.labelRow}>
                    {selected ? (
                      <CheckCircle size={18} color={c.text} weight="fill" />
                    ) : (
                      <Circle size={18} color={c.muted} />
                    )}
                    <Text style={[styles.label, { color: selected ? c.text : c.soft }]}>{label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.note, { color: c.muted }]}>
            {theme === 'system'
              ? `Following your phone, which is ${activeTheme} right now. It switches on its own.`
              : `Always ${theme}, whatever your phone is set to.`}
          </Text>
        </Section>

        {appIconsSupported() ? <AppIconPicker /> : null}
      </ScrollView>
    </View>
  );
}

/** Grid of home-screen icons; the current one wears the silver selection frame. */
function AppIconPicker() {
  const c = useCosmos();
  const { width } = useWindowDimensions();
  const [current, setCurrent] = useState<AppIconName>(currentAppIcon);
  const gap = spacing[4];
  const tile = Math.floor((width - GUTTER * 2 - gap * (ICON_COLUMNS - 1)) / ICON_COLUMNS);
  const radius = (tile - 6) * 0.22;

  const choose = async (name: AppIconName) => {
    if (name === current) return;
    const previous = current;
    setCurrent(name);
    try {
      await setAppIcon(name);
    } catch {
      setCurrent(previous);
      AppAlert.alert('Couldn’t change the icon', 'Please try again.');
    }
  };

  return (
    <Section title="App icon" subtitle="Pick the one on your home screen" style={styles.section}>
      <View style={[styles.icons, { gap }]} accessibilityRole="radiogroup">
        {APP_ICONS.map((icon) => {
          const selected = current === icon.name;
          return (
            <Pressable
              key={icon.name}
              onPress={() => choose(icon.name)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${icon.label} app icon`}
              style={({ pressed }) => [{ width: tile, alignItems: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            >
              {/* iOS-style rounded square (~22% of the side); the frame hugs it 3pt out. */}
              <View style={[styles.iconFrame, { borderRadius: radius + 3, backgroundColor: selected ? c.primary : 'transparent' }]}>
                <Image source={icon.preview} style={{ width: tile - 6, height: tile - 6, borderRadius: radius }} />
              </View>
              <Text style={[styles.iconLabel, { color: selected ? c.text : c.soft }]} numberOfLines={1}>{icon.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

/**
 * A tiny Unifesto screen in one scheme: page, a cover card, two lines of
 * text and a primary button. In System's split tile each half draws the
 * whole screen and shows only its `side`, so the two halves line up.
 */
function Preview({ scheme, side }: { scheme: 'dark' | 'light'; side?: 'left' | 'right' }) {
  const t = cosmosFor(scheme);
  return (
    <View style={[styles.screen, { backgroundColor: t.bg }, side && styles.whole, side === 'right' && styles.right]}>
      <View style={[styles.cover, { backgroundColor: t.raised }]} />
      <View style={[styles.line, { backgroundColor: t.text, width: '80%' }]} />
      <View style={[styles.line, { backgroundColor: t.muted, width: '55%', opacity: 0.7 }]} />
      <View style={[styles.button, { backgroundColor: t.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Section's default top margin is sized for Home; tighter at the top of a page.
  firstSection: { marginTop: spacing[6] },
  section: { marginTop: spacing[8] },
  options: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: GUTTER, gap: spacing[3] },
  option: { flex: 1, alignItems: 'center' },
  // The selection ring: a silver frame around the preview (a radio state, not a card border).
  frame: { padding: 3, borderRadius: cosmosRadius + 3, width: '100%' },
  split: { flexDirection: 'row', borderRadius: cosmosRadius, overflow: 'hidden' },
  half: { flex: 1, overflow: 'hidden' },
  screen: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: cosmosRadius,
    padding: 10,
    gap: 7,
    overflow: 'hidden',
  },
  // In the split, each half draws a full-width screen and shows its own side.
  whole: { width: '200%', borderRadius: 0 },
  right: { marginLeft: '-100%' },
  cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },
  line: { height: 6, borderRadius: 3 },
  button: { marginTop: 'auto', height: 14, borderRadius: 7 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER },
  iconFrame: { padding: 3 },
  iconLabel: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing[3] },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: {
    marginTop: spacing[6],
    marginHorizontal: GUTTER,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...cosmosFont.body,
  },
});
