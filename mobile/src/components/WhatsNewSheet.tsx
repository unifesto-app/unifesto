import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { UnGlyph, X } from '@unifesto/unicon/react-native';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { TopLayer } from './ui/TopLayer';
import { SheetBackdrop } from './ui/CardSurface';
import AuthButton from './auth/AuthButton';
import { WHATS_NEW, sectionsFor, shouldShowWhatsNew } from '../lib/whatsNew';
import { spacing } from '../theme/spacing';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const SEEN_KEY = 'whatsNew.seen';
/** Written by appVersionReport on any earlier version; tells an upgrade from a fresh install. */
const EARLIER_VERSION_KEY = 'unifesto_last_reported_app_version';
/** Let the store-update prompt have its say first. */
const SHOW_DELAY_MS = 2500;
const CLOSE_MS = 180;

let setOpenRef: ((open: boolean) => void) | null = null;
let pendingOpen = false;

/** Opens the newest notes (Profile › What's new). */
export function openWhatsNew() {
  if (setOpenRef) setOpenRef(true);
  else pendingOpen = true;
}

/**
 * Show the newest notes once per version after an update. Decides right away,
 * before this launch's own version report can make a fresh install look like
 * an upgrade, then opens after a short delay. Never throws.
 */
export async function showWhatsNewIfNeeded(): Promise<void> {
  const latest = WHATS_NEW[0];
  if (!latest) return;
  try {
    const [seen, earlier] = await Promise.all([AsyncStorage.getItem(SEEN_KEY), AsyncStorage.getItem(EARLIER_VERSION_KEY)]);
    if (seen === latest.version) return;
    await AsyncStorage.setItem(SEEN_KEY, latest.version);
    if (shouldShowWhatsNew(latest.version, seen, earlier !== null)) setTimeout(openWhatsNew, SHOW_DELAY_MS);
  } catch {
    // Storage unavailable: skip rather than nag every launch.
  }
}

/** Mounted once at the app root, inside SpaceAccessProvider. */
export default function WhatsNewSheet() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const access = useSpaceAccess();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    setOpenRef = setOpen;
    if (pendingOpen) {
      pendingOpen = false;
      setOpen(true);
    }
    return () => {
      setOpenRef = null;
    };
  }, []);

  // Wait for roles so the organiser section doesn't pop in after the sheet opens.
  const visible = open && access.loaded;
  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    progress.value = withSpring(1, { damping: 20, stiffness: 240, mass: 0.8 });
  }, [visible, progress]);

  const close = useCallback(() => {
    progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.quad) });
    setTimeout(() => setOpen(false), CLOSE_MS + 10);
  }, [progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // Slides, never fades: opacity under 1 breaks Liquid Glass.
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height }] }));

  const release = WHATS_NEW[0];
  if (!visible || !release) return null;

  // Same rule as Profile's Hosting section: a Space tab means an operator role.
  const sections = sectionsFor(release, access.sections.length > 0);

  return (
    <TopLayer visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          style={[styles.card, { maxHeight: height * 0.88, paddingBottom: insets.bottom + spacing[4] }, cardStyle]}
          accessibilityViewIsModal
        >
          <SheetBackdrop radius={28} />
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>What’s new</Text>
              <Text style={[styles.version, { color: c.muted }]}>Version {release.version}</Text>
            </View>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <X size={22} color={c.soft} weight="bold" />
            </Pressable>
          </View>

          <ScrollView style={styles.flexShrink} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                {sections.length > 1 ? (
                  <Text style={[styles.sectionTitle, { color: c.muted }]}>{section.title}</Text>
                ) : null}
                {section.items.map((item) => (
                  <View key={item.title} style={styles.item}>
                    {item.icon ? <UnGlyph name={item.icon} size={24} color={c.text} /> : null}
                    <View style={styles.flex}>
                      <Text style={[styles.itemTitle, { color: c.text }]}>{item.title}</Text>
                      {item.body ? <Text style={[styles.itemBody, { color: c.soft }]}>{item.body}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <AuthButton label="Got it" onPress={close} style={styles.button} />
        </Animated.View>
      </View>
    </TopLayer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginBottom: spacing[2] },
  title: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  version: { marginTop: spacing[1], fontSize: 14, ...cosmosFont.body },
  list: { paddingVertical: spacing[3], gap: spacing[6] },
  section: { gap: spacing[4] },
  sectionTitle: { fontSize: 14, ...cosmosFont.strong },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4] },
  itemTitle: { fontSize: 16, lineHeight: 22, ...cosmosFont.strong },
  itemBody: { marginTop: 2, fontSize: 15, lineHeight: 21, ...cosmosFont.body },
  button: { marginTop: spacing[4] },
});
