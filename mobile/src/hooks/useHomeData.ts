import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { onReconnect } from '../lib/offline/connectivity';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { getProfile, Profile } from '../lib/api/profile';
import {
  Event,
  getEvents,
  getCategories,
  getFeaturedEvents,
  getTrendingEvents,
} from '../lib/api/events';
import { getUserSpaces, Space, getAllSpaces, getSpaceBySlug, getSpaceEvents } from '../lib/api/spaces';
import { getFavorites } from '../lib/api/favorites';
import { fetchUpcomingTickets } from '../lib/upcomingTickets';
import { syncUpNextWidget } from '../widgets/sync';

// WeGoBeyond, whose events join Home's "Happening near you". Found by slug, so
// renaming the space (it was "Beyond by Unifesto") can't lose its events again.
export const BEYOND_SLUG = 'beyond';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied';

/** An upcoming registration flattened onto its event, as the ticket screen expects. */
export type UpcomingTicket = Event & {
  qrCode?: string;
  registrationId?: string;
  registrationStatus?: string;
  /** The event's own status (COMPLETED / CANCELLED means it's over). */
  eventStatus?: string;
  ticketType?: unknown;
  ticketCode?: string;
  /** A seat I claimed in someone else's group (read-only ticket). */
  isGroupMember?: boolean;
  leadName?: string | null;
};

/**
 * Decide which events surface under "Popular Events" and in what order.
 * Leads with curated "featured" picks, then trending, then upcoming, and
 * de-duplicates by id so no event appears twice.
 */
export function buildPopularEvents(featured: Event[], trending: Event[], upcoming: Event[]): Event[] {
  const merged = [...featured, ...trending, ...upcoming];
  const seen = new Set<string>();
  return merged.filter((e) => {
    const key = String(e?.id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// "Happening near you" should surface whole events, not their parts: when an
// event is a sub-event of a bigger "super event", show the super event instead,
// and leave standalone/individual events as-is. Sub-events of the same parent
// collapse to a single super-event card (deduped by id).
export function rollUpToSuperEvents(events: Event[]): Event[] {
  const seen = new Set<string>();
  const out: Event[] = [];
  for (const e of events) {
    // A populated `parentEvent` means `e` is a sub-event — swap in the parent.
    // A space's event list only sends the parent's { id, title, slug }: with no
    // dates to show, keep the sub-event itself.
    const canonical = (e?.parentEvent?.startDateTime ? e.parentEvent : e) as unknown as Event;
    const key = String(canonical?.id ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

/**
 * K1: a placeholder space (unverified, no events, just its creator) stays off
 * Home's discovery rails, so they open on spaces that run things.
 */
export function isPlaceholderSpace(s: Space): boolean {
  const count = (s as Space & { _count?: { events?: number; userRoles?: number } })._count;
  return !s.verifiedAt && !(count?.events ?? s.event_count) && (count?.userRoles ?? s.member_count ?? 0) <= 1;
}

/**
 * /users/me/spaces returns one row per role, so a Space Admin who is also a
 * Member shows up twice. Keep one row per space, preferring a non-member role.
 */
export function uniqueSpaces(spaces: Space[]): Space[] {
  const byId = new Map<string, Space>();
  const code = (s: Space) => (s.userRole as { code?: string } | null | undefined)?.code;
  for (const s of spaces) {
    const prev = byId.get(s.id);
    if (!prev || (code(prev) === 'MEMBER' && code(s) !== 'MEMBER')) byId.set(s.id, s);
  }
  return [...byId.values()];
}

/**
 * Everything the Home tab shows, loaded in parallel on mount and re-fetched on
 * pull-to-refresh. Each loader owns its own loading flag so sections can
 * skeleton independently instead of the whole screen waiting on the slowest call.
 */
export function useHomeData() {
  const { user, token } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [upcomingTickets, setUpcomingTickets] = useState<UpcomingTicket[]>([]);
  // Seeded from `user` so a signed-in first frame skeletons instead of popping in.
  const [isLoadingTickets, setIsLoadingTickets] = useState(!!user);

  const [mySpaces, setMySpaces] = useState<Space[]>([]);
  const [isLoadingMySpaces, setIsLoadingMySpaces] = useState(!!user);
  const [allSpaces, setAllSpaces] = useState<Space[]>([]);

  const [categories, setCategories] = useState<any[]>([]);

  const [beyondEvents, setBeyondEvents] = useState<Event[]>([]);

  const [favoriteEvents, setFavoriteEvents] = useState<Event[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(!!user);

  const [trendingEvents, setTrendingEvents] = useState<Event[]>([]);
  const [popularEvents, setPopularEvents] = useState<Event[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  // Set when the event feeds fail, so Home says "couldn't load" instead of "nothing on".
  const [eventsFailed, setEventsFailed] = useState(false);
  // False once the OS stops showing the prompt: "Set location" then opens Settings.
  const [canAskLocation, setCanAskLocation] = useState(true);


  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [nearbyEvents, setNearbyEvents] = useState<Event[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const userProfile = await getProfile();
      if (userProfile) setProfile(userProfile);
    } catch {}
  }, [user]);

  const loadUpcomingTickets = useCallback(async () => {
    if (!user) {
      setUpcomingTickets([]);
      setIsLoadingTickets(false);
      // Signed out: the home-screen widget must not keep showing tickets.
      void syncUpNextWidget(null);
      return;
    }
    try {
      setIsLoadingTickets(true);
      // Shared with the widget refresh; events stay until they end (see upcomingTickets.ts).
      const upcoming = await fetchUpcomingTickets(5);
      setUpcomingTickets(upcoming);
      void syncUpNextWidget(upcoming);
    } catch {
      // Keep the card and the widget on their last good tickets: a failed
      // refresh is not "no tickets".
    } finally {
      setIsLoadingTickets(false);
    }
  }, [user]);

  const loadMySpaces = useCallback(async () => {
    if (!user || !token) {
      setMySpaces([]);
      setIsLoadingMySpaces(false);
      return;
    }
    try {
      setIsLoadingMySpaces(true);
      const userSpaces = await getUserSpaces();
      setMySpaces(uniqueSpaces(userSpaces ?? []).slice(0, 10));
    } catch (error) {
      if (__DEV__) console.error('Failed to load user spaces:', error);
      setMySpaces([]);
    } finally {
      setIsLoadingMySpaces(false);
    }
  }, [user]);

  // Popular spaces for the search sheet.
  const loadAllSpaces = useCallback(async () => {
    try {
      const response = await getAllSpaces({ page: 1, limit: 24 });
      setAllSpaces(response.spaces.filter((sp) => !isPlaceholderSpace(sp)).slice(0, 8));
    } catch (error) {
      if (__DEV__) console.error('Failed to load all spaces:', error);
      setAllSpaces([]);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getCategories());
    } catch {
      setCategories([]);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setIsLoadingEvents(true);
      const [featured, trending, upcoming] = await Promise.all([
        getFeaturedEvents(10),
        getTrendingEvents(10),
        getEvents({ page: 1, limit: 10 }),
      ]);
      const upcomingList = upcoming?.data || upcoming?.events || [];
      setTrendingEvents(trending);
      setPopularEvents(buildPopularEvents(featured, trending, upcomingList));
      setEventsFailed(false);
    } catch {
      setTrendingEvents([]);
      setPopularEvents([]);
      setEventsFailed(true);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteEvents([]);
      setIsLoadingFavorites(false);
      return;
    }
    try {
      setIsLoadingFavorites(true);
      const favs = await getFavorites();
      setFavoriteEvents(favs || []);
    } catch {
      setFavoriteEvents([]);
    } finally {
      setIsLoadingFavorites(false);
    }
  }, [user]);

  // WeGoBeyond's upcoming events.
  const loadBeyond = useCallback(async () => {
    try {
      const space = await getSpaceBySlug(BEYOND_SLUG);
      const res = await getSpaceEvents(space.id, 1, 10);
      // The space feed shows its own team drafts too; Home is public listings only.
      setBeyondEvents((res?.events || []).filter((e) => e.status !== 'DRAFT'));
    } catch {
      setBeyondEvents([]);
    }
  }, []);

  // Fetch city-scoped events once we know the user's city
  const loadNearby = useCallback(async (city: string) => {
    try {
      setIsLoadingNearby(true);
      const eventsRes = await getEvents({ page: 1, limit: 10, city });
      setNearbyEvents(eventsRes?.data || eventsRes?.events || []);
    } catch {
      setNearbyEvents([]);
    } finally {
      setIsLoadingNearby(false);
    }
  }, []);

  // Detect device location → reverse-geocode to a city name
  const loadLocation = useCallback(async () => {
    try {
      setLocationStatus('loading');
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        setCanAskLocation(canAskAgain);
        return;
      }
      // Only the city matters: a fix from the last few hours is instant, where a
      // fresh one can take many seconds indoors.
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 6 * 60 * 60 * 1000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const place = places?.[0];
      // City only: subregion is a district ("NTR") and region a state, and the
      // nearby feeds filter by city name, so neither would match anyway.
      const city = place?.city || null;
      setLocationStatus('granted');
      if (city) {
        setDetectedCity(city);
        loadNearby(city);
      }
    } catch {
      setLocationStatus('denied');
    }
  }, [loadNearby]);

  useEffect(() => {
    loadProfile();
    loadUpcomingTickets();
    loadMySpaces();
    loadAllSpaces();
    loadCategories();
    loadEvents();
    loadBeyond();
    loadFavorites();
    loadLocation();
  }, [loadProfile, loadUpcomingTickets, loadMySpaces, loadAllSpaces, loadCategories, loadEvents, loadBeyond, loadFavorites, loadLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadProfile(),
        loadUpcomingTickets(),
        loadMySpaces(),
        loadAllSpaces(),
        loadEvents(),
        loadBeyond(),
        loadFavorites(),
        detectedCity ? loadNearby(detectedCity) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, loadUpcomingTickets, loadMySpaces, loadAllSpaces, loadEvents, loadBeyond, loadFavorites, loadNearby, detectedCity]);

  // Back from Settings with location switched on: pick the city up without a restart.
  useEffect(() => {
    if (locationStatus !== 'denied') return;
    const sub = AppState.addEventListener('change', async (st) => {
      if (st === 'active' && (await Location.getForegroundPermissionsAsync()).granted) void loadLocation();
    });
    return () => sub.remove();
  }, [locationStatus, loadLocation]);

  // Screens showing saved copies while offline catch up once we're back.
  useEffect(() => onReconnect(() => void onRefresh()), [onRefresh]);

  // ── Derived sections ──────────────────────────────────────────────────────
  // "Happening near you", in priority order: city events, then WeGoBeyond's, then
  // curated popular picks so it's never empty. Sub-events roll up to their super
  // event; the list keeps the first few that aren't over and sorts those by date
  // (groupByDay), so the city always wins a place.
  const feedEvents = useMemo(
    () => rollUpToSuperEvents(buildPopularEvents(detectedCity ? nearbyEvents : [], beyondEvents, popularEvents)),
    [detectedCity, nearbyEvents, popularEvents, beyondEvents],
  );
  // Not held for the location: the list shows as soon as the feeds land, and the
  // city's events slot in first once it's known.
  const isLoadingFeed = isLoadingEvents || (detectedCity ? isLoadingNearby : false);

  return {
    user,
    profile,
    refreshing,
    onRefresh,

    upcomingTickets,
    isLoadingTickets,

    feedEvents,
    isLoadingFeed,
    trendingEvents,
    popularEvents,
    isLoadingEvents,
    eventsFailed,

    favoriteEvents,
    isLoadingFavorites,

    mySpaces,
    isLoadingMySpaces,
    allSpaces,

    categories,

    detectedCity,
    locationStatus,
    loadLocation,
    canAskLocation,
  };
}

export type HomeData = ReturnType<typeof useHomeData>;
