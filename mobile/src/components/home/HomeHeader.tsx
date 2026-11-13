import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Bell, MagnifyingGlass, NavigationArrow } from '../ui/icons';
import { useStableTopInset } from '../CustomHeader';
import type { LocationStatus } from '../../hooks/useHomeData';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, displayTracking, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { CardBackdrop, CardSurfaceProvider } from '../ui/CardSurface';
import { GUTTER } from './Section';
import PressableScale from '../ui/PressableScale';

// The wordmark's own "u" (the splash letter), 96×72.
const U_H = 24;
const U_W = Math.round((U_H * 96) / 72);
const BELL = 36;
const SEARCH_H = 44;
const BAR_PAD = spacing[2];
/** The bar's height under the status bar, for the pull-to-refresh spinner. */
export const HOME_BAR_H = BAR_PAD * 2 + SEARCH_H;

interface HomeBarProps {
  /** Guests get no bell. */
  signedIn: boolean;
  /** Unread in-app notifications; the bell shows only when signed in. */
  unread?: number;
  onPressBell?: () => void;
  onPressSearch: () => void;
  /** Content is under the bar: it turns glass. */
  scrolled: boolean;
}

/**
 * Home's top bar, pinned like District's: the u, search, and my bell. It is
 * Home's sticky header, so it floats over the page once it scrolls and only
 * then turns glass (floating chrome); at the top it sits on the plain ground.
 */
export function HomeBar({ signedIn, unread = 0, onPressBell, onPressSearch, scrolled }: HomeBarProps) {
  const c = useCosmos();
  const topInset = useStableTopInset();

  return (
    <View style={{ paddingTop: topInset + BAR_PAD, paddingBottom: BAR_PAD, paddingHorizontal: GUTTER }}>
      {scrolled ? (
        <CardSurfaceProvider kind="glass">
          <CardBackdrop opaque style={{ borderRadius: 0 }} />
        </CardSurfaceProvider>
      ) : null}
      <View style={styles.bar}>
        <Image
          source={
            c.scheme === 'dark' ? require('../../../assets/brand/letters/silver-u.png') : require('../../../assets/brand/letters/ink-u.png')
          }
          style={{ width: U_W, height: U_H }}
          contentFit="contain"
          accessibilityLabel="Unifesto"
        />

        <PressableScale
          onPress={onPressSearch}
          accessibilityRole="search"
          accessibilityLabel="Search events and spaces"
          style={[styles.search, { borderColor: c.input, backgroundColor: c.card }]}
        >
          <MagnifyingGlass size={18} color={c.muted} />
          <Text style={[styles.searchText, { color: c.muted }]} numberOfLines={1}>Search events, spaces, vibes</Text>
        </PressableScale>

        {signedIn && onPressBell ? (
          <PressableScale
            onPress={onPressBell}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            style={styles.bell}
          >
            <Bell size={24} color={c.text} weight={unread ? 'fill' : 'regular'} />
            {unread ? (
              <View style={[styles.badge, { backgroundColor: c.primary }]}>
                <Text style={[styles.badgeText, { color: c.primaryFg }]}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

interface HomeHeadlineProps {
  city: string | null;
  locationStatus: LocationStatus;
  onEnableLocation: () => void;
}

/** The DM Sans headline under the bar, scrolling with the page. The city lives only here. */
export function HomeHeadline({ city, locationStatus, onEnableLocation }: HomeHeadlineProps) {
  const c = useCosmos();
  return (
    <View style={styles.headlineWrap}>
      <Text style={[styles.headline, { color: c.text }]} accessibilityRole="header">
        What's on{city ? ` in ${city}` : ''}?
      </Text>
      {!city && locationStatus === 'denied' ? (
        <PressableScale
          feedback="inline"
          onPress={onEnableLocation}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Use my location"
          style={styles.locate}
        >
          <NavigationArrow size={14} color={c.soft} weight="fill" />
          <Text style={[styles.locateText, { color: c.soft }]}>Use my location</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  search: {
    flex: 1,
    height: SEARCH_H,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  searchText: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  bell: { width: BELL, height: BELL, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, ...cosmosFont.strong },
  headlineWrap: { paddingHorizontal: GUTTER, marginTop: spacing[5] },
  headline: { fontSize: 32, lineHeight: 38, ...cosmosFont.display, letterSpacing: displayTracking(32) },
  locate: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing[2], alignSelf: 'flex-start' },
  locateText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
