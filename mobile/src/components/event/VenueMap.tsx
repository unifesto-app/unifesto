import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { MapPin, NavigationArrow } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const MAP_HEIGHT = 180;

// ── Native maps availability ────────────────────────────────────────────────
// iOS: always native. The iOS build registers the map *views* but never
// registers `RNMapsAirModule` as a TurboModule (its moduleName is nil), so a
// module check would wrongly report "not installed" there. This app has no
// OTA updates, so this JS only ever runs on a binary that includes the maps.
// Android: the module IS registered, so it's a real "is it in this build?"
// check, and Google Maps additionally needs the API key baked in.
const hasAndroidModule = Platform.OS === 'android' && !!TurboModuleRegistry.get('RNMapsAirModule');
const hasAndroidKey = !!Constants.expoConfig?.extra?.hasAndroidMapsKey;
const useNative = Platform.OS === 'ios' || (hasAndroidModule && hasAndroidKey);

let Maps: typeof import('react-native-maps') | null = null;
if (useNative) {
  try {
    Maps = require('react-native-maps');
  } catch {
    Maps = null;
  }
}

// Dark Google Maps style (Android native) to match the black canvas. Light
// mode uses Google's default look (no custom style).
const DARK_GOOGLE_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a2b' }] },
];

type Coords = { latitude: number; longitude: number };

export interface VenuePlace {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface VenueMapProps {
  /** Exact coordinates when the organiser set them. */
  coords?: Coords | null;
  /** The venue's free-text location parts, used to geocode. */
  place: VenuePlace;
  name: string;
  address?: string | null;
  accent: string;
  /** Omit to hide the Directions link (e.g. a preview in a form). */
  onDirections?: () => void;
}

const join = (...parts: (string | null | undefined)[]) =>
  parts.map((p) => p?.trim()).filter(Boolean).join(', ');

/** Everything we know, for the Google web search (best at named venues). */
export const fullPlaceQuery = (p: VenuePlace) =>
  join(p.name, p.address, p.city, p.state, p.country || 'India');

/**
 * Geocoder lookups, most precise first. Street-address geocoders (Apple's in
 * particular) match an address better than a venue name, so the address leads;
 * state + country stop "Main Auditorium, Hyderabad" matching somewhere else.
 */
function geocodeCandidates(p: VenuePlace): string[] {
  const country = p.country || 'India';
  const list = [
    p.address ? join(p.address, p.city, p.state, country) : '',
    p.address && p.name ? join(p.name, p.address, p.city, p.state, country) : '',
    p.name ? join(p.name, p.city, p.state, country) : '',
  ].filter(Boolean);
  return Array.from(new Set(list));
}

/** Metres between two points (haversine). */
function distanceM(a: Coords, b: Coords) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A "venue" result this close to the city's own centre means the geocoder gave up. */
const CITY_CENTRE_RADIUS_M = 400;

async function geocodeFirst(query: string): Promise<Coords | null> {
  const [hit] = await Location.geocodeAsync(query);
  return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
}

/**
 * Try the lookups in order and take the first one that is genuinely specific.
 * A hit sitting on the city's centre is the geocoder falling back to "the
 * city", so it is skipped rather than pinning the wrong spot. Throws when the
 * geocoder can't run (Android needs a location permission first).
 */
export async function geocodeVenue(place: VenuePlace): Promise<Coords | null> {
  const cityQuery = place.city ? join(place.city, place.state, place.country || 'India') : '';
  let cityCentre: Coords | null | undefined;
  for (const q of geocodeCandidates(place)) {
    const hit = await geocodeFirst(q).catch(() => null);
    if (!hit) continue;
    if (cityQuery) {
      if (cityCentre === undefined) cityCentre = await geocodeFirst(cityQuery).catch(() => null);
      if (cityCentre && distanceM(hit, cityCentre) < CITY_CENTRE_RADIUS_M) continue;
    }
    return hit;
  }
  return null;
}

/**
 * Venue map: native (Apple Maps on iOS, Google Maps on Android) with a pin,
 * dark-styled and non-interactive so it never traps the page scroll. Falls
 * back to a keyless Google embed when native maps aren't available in this
 * build, or when the venue can't be geocoded. Directions opens the maps app.
 */
export default function VenueMap({ coords, place, name, address, accent, onDirections }: VenueMapProps) {
  const tokens = useTokens();
  const c = useCosmos();
  const [resolved, setResolved] = useState<Coords | null>(coords ?? null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  // No saved coordinates (older events typed the venue as free text): geocode
  // it. Android's geocoder needs a location permission — only used if already
  // granted (never prompt here).
  const candidates = geocodeCandidates(place);
  const candidateKey = candidates.join('|');

  useEffect(() => {
    if (coords || !Maps) return;
    if (candidates.length === 0) {
      setGeocodeFailed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') throw new Error('no permission');
        }
        const hit = await geocodeVenue(place);
        if (cancelled) return;
        if (hit) setResolved(hit);
        else setGeocodeFailed(true);
      } catch {
        if (!cancelled) setGeocodeFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, candidateKey]);
  const showNative = !!Maps && !!resolved;
  const showWeb = !Maps || geocodeFailed;

  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <View style={[styles.map, { backgroundColor: c.card }]} pointerEvents="none">
        {showNative && Maps ? (
          <Maps.default
            style={StyleSheet.absoluteFill}
            // Controlled region: the map is fixed (no gestures), and on the new
            // architecture `initialRegion` can be missed, leaving the default view.
            region={{ ...resolved!, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
            userInterfaceStyle={tokens.scheme}
            customMapStyle={Platform.OS === 'android' && tokens.scheme === 'dark' ? DARK_GOOGLE_STYLE : undefined}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsPointsOfInterests={false}
            showsCompass={false}
            liteMode={Platform.OS === 'android'}
          >
            <Maps.Marker coordinate={resolved!} pinColor={accent} title={name || undefined} description={address || undefined} />
          </Maps.default>
        ) : showWeb ? (
          // Named venue → search by name + address so the map labels it;
          // coordinates alone only drop an unnamed pin.
          <WebMap query={place.name?.trim() || !coords ? fullPlaceQuery(place) : `${coords.latitude},${coords.longitude}`} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <MapPin size={28} color={tokens.textMuted} weight="duotone" />
          </View>
        )}
      </View>

      <View style={styles.row}>
        <MapPin size={24} color={c.text} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{name}</Text>
          {address ? (
            <Text style={[styles.address, { color: c.muted }]} numberOfLines={2}>{address}</Text>
          ) : null}
        </View>
        {onDirections ? (
          <Pressable
            onPress={onDirections}
            hitSlop={10}
            accessibilityRole="link"
            accessibilityLabel="Get directions"
            style={({ pressed }) => [styles.directions, { opacity: pressed ? 0.6 : 1 }]}
          >
            <NavigationArrow size={16} color={c.text} weight="fill" />
            <Text style={[styles.directionsText, { color: c.text }]}>Directions</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Keyless Google embed (CSS-inverted to a dark look in dark mode). The fallback path. */
function WebMap({ query }: { query: string }) {
  const tokens = useTokens();
  const [loaded, setLoaded] = useState(false);
  const html = useMemo(() => {
    const src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
    return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:${tokens.elevated};overflow:hidden}
iframe{border:0;width:100%;height:calc(100% + 60px);margin-top:-30px;${tokens.scheme === 'dark' ? 'filter:invert(90%) hue-rotate(180deg) saturate(.85)' : ''}}</style>
</head><body><iframe src="${src}" loading="eager"></iframe></body></html>`;
  }, [query, tokens.elevated, tokens.scheme]);
  const style = useAnimatedStyle(() => ({ opacity: withTiming(loaded ? 1 : 0, { duration: 350 }) }));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <WebView
          source={{ html, baseUrl: 'https://maps.google.com' }}
          onLoadEnd={() => setTimeout(() => setLoaded(true), 250)}
          scrollEnabled={false}
          originWhitelist={['*']}
          style={{ backgroundColor: 'transparent' }}
          containerStyle={{ backgroundColor: 'transparent' }}
          androidLayerType="hardware"
        />
      </Animated.View>
      {!loaded ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <MapPin size={28} color={tokens.textMuted} weight="duotone" />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  map: { height: MAP_HEIGHT, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4] },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  address: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
  directions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  directionsText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
