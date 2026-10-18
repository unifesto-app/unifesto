import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Bell, CalendarDots, Globe, MagnifyingGlass, MapPin, NavigationArrow, SlidersHorizontal, Ticket, UserCircle } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../CustomHeader';
import type { LocationStatus } from '../../hooks/useHomeData';
import { PRESETS, type Preset } from '../../hooks/useEventsBrowse';
import { HeaderMenu, type HeaderMenuItem } from '../../navigation/HeaderActions';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import PressableScale from '../ui/PressableScale';

// Brand wordmark PNG is 2400×551.
const MARK_W = 112;
const MARK_H = Math.round((MARK_W * 551) / 2400);
const AVATAR = 36;
const SEARCH_H = 52;

const PRESET_ICONS: Record<Preset, HeaderMenuItem['icon']> = {
  weekend: { ios: 'calendar', android: 'ic_menu_my_calendar', glyph: CalendarDots },
  free: { ios: 'ticket', android: 'ic_menu_agenda', glyph: Ticket },
  online: { ios: 'globe', android: 'ic_menu_mapmode', glyph: Globe },
};
/** Quick-filter menu items, shared with the Events screen's filter button. */
export const PRESET_ITEMS: HeaderMenuItem[] = PRESETS.map((p) => ({ id: p.key, title: p.label, icon: PRESET_ICONS[p.key] }));

interface HomeHeaderProps {
  /** First name when signed in ('' if none yet); null for guests (no avatar). */
  firstName: string | null;
  avatarUrl?: string | null;
  city: string | null;
  locationStatus: LocationStatus;
  onEnableLocation: () => void;
  onPressAvatar: () => void;
  /** Unread in-app notifications; the bell shows only when signed in. */
  unread?: number;
  onPressBell?: () => void;
  onPressSearch: () => void;
  /** Quick filter picked from the menu beside search; opens Events pre-filtered. */
  onPressPreset: (preset: Preset) => void;
}

/**
 * Home masthead in the web's layout: wordmark left with place + me on the
 * right (like the site's navbar), then a Michroma headline and the search
 * field. Scrolls inline with the page (not sticky), so it's content layer:
 * solid fills, no Liquid Glass (glass is for floating chrome only).
 */
export default function HomeHeader({
  firstName,
  avatarUrl,
  city,
  locationStatus,
  onEnableLocation,
  onPressAvatar,
  unread = 0,
  onPressBell,
  onPressSearch,
  onPressPreset,
}: HomeHeaderProps) {
  const c = useCosmos();
  const topInset = useStableTopInset();

  return (
    <View style={{ paddingTop: topInset + spacing[3], paddingHorizontal: GUTTER }}>
      <View style={styles.bar}>
        <Image
          source={c.scheme === 'dark' ? require('../../../assets/brand/wordmark-silver.png') : require('../../../assets/brand/wordmark-ink.png')}
          style={{ width: MARK_W, height: MARK_H }}
          contentFit="contain"
          accessibilityLabel="Unifesto"
        />

        <View style={styles.barRight}>
          {city ? (
            // Plain label, not a chip: it isn't tappable, so it shouldn't look like a control.
            <View style={styles.place}>
              <MapPin size={14} color={c.soft} weight="fill" />
              <Text style={[styles.chipText, { color: c.soft }]} numberOfLines={1}>{city}</Text>
            </View>
          ) : locationStatus === 'denied' ? (
            <PressableScale
              onPress={onEnableLocation}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Use my location"
              style={[
                styles.chip,
                { borderColor: c.border, backgroundColor: c.card },
              ]}
            >
              <NavigationArrow size={13} color={c.muted} weight="fill" />
              <Text style={[styles.chipText, { color: c.muted }]}>Set location</Text>
            </PressableScale>
          ) : null}

          {firstName !== null && onPressBell ? (
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

          {firstName !== null ? (
            <PressableScale
              onPress={onPressAvatar}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={[styles.avatar, { borderColor: c.outline, backgroundColor: c.card }]}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
              ) : firstName ? (
                <Text style={[styles.avatarText, { color: c.text }]}>{firstName.charAt(0).toUpperCase()}</Text>
              ) : (
                <UserCircle size={22} color={c.text} />
              )}
            </PressableScale>
          ) : null}
        </View>
      </View>

      <Text style={[styles.headline, { color: c.text }]}>
        What's on{city ? ` in ${city}` : ''}?
      </Text>

      <View style={styles.searchRow}>
        <PressableScale
          onPress={onPressSearch}
          accessibilityRole="search"
          accessibilityLabel="Search events and spaces"
          style={[
            styles.search,
            { borderColor: c.input, backgroundColor: c.card },
          ]}
        >
          <MagnifyingGlass size={18} color={c.muted} />
          <Text style={[styles.searchText, { color: c.muted }]} numberOfLines={1}>Search events, spaces, vibes</Text>
        </PressableScale>
        <HeaderMenu
          title="Browse events"
          items={PRESET_ITEMS}
          onSelect={(id) => onPressPreset(id as Preset)}
          label="Filter events"
          trigger={<SlidersHorizontal size={20} color={c.text} />}
          triggerStyle={[styles.filter, { borderColor: c.input, backgroundColor: c.card }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: spacing[3] },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    maxWidth: 150,
  },
  place: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 150, flexShrink: 1 },
  chipText: { fontSize: typography.fontSize.sm, flexShrink: 1, ...cosmosFont.strong },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, ...cosmosFont.strong },
  bell: { width: AVATAR, height: AVATAR, alignItems: 'center', justifyContent: 'center' },
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
  // Michroma has one weight and runs wide: 28px fits "What's on in Hyderabad?" in two lines.
  headline: { marginTop: spacing[8], fontSize: 28, lineHeight: 36, ...cosmosFont.display },
  searchRow: { marginTop: spacing[6], flexDirection: 'row', gap: spacing[2] },
  search: {
    flex: 1,
    minHeight: SEARCH_H,
    paddingVertical: spacing[3],
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  searchText: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  filter: {
    width: SEARCH_H,
    height: SEARCH_H,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
