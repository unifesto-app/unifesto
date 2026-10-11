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
import { listSessions, type Session } from '../lib/api/sessions';
import { getUserSpaces, Space, getAllSpaces, getSpaceEvents } from '../lib/api/spaces';
import { getFavorites } from '../lib/api/favorites';
import { fetchUpcomingTickets } from '../lib/upcomingTickets';
import { syncUpNextWidget } from '../widgets/sync';

// The featured partner space whose events get their own home rail.
export const BEYOND_SPACE_NAME = 'Beyond by Unifesto';

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
    const canonical = (e?.parentEvent ? e.parentEvent : e) as unknown as Event;
    const key = String(canonical?.id ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
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
  const [isLoadingAllSpaces, setIsLoadingAllSpaces] = useState(true);

  const [categories, setCategories] = useState<any[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const [beyondSpace, setBeyondSpace] = useState<Space | null>(null);
  const [beyondEvents, setBeyondEvents] = useState<Event[]>([]);
  const [isLoadingBeyond, setIsLoadingBeyond] = useState(true);

  const [favoriteEvents, setFavoriteEvents] = useState<Event[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(!!user);

  const [trendingEvents, setTrendingEvents] = useState<Event[]>([]);
  const [popularEvents, setPopularEvents] = useState<Event[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  // Set when the event feeds fail, so Home says "couldn't load" instead of "nothing on".
  const [eventsFailed, setEventsFailed] = useState(false);
  // False once the OS stops showing the prompt: "Set location" then opens Settings.
  const [canAskLocation, setCanAskLocation] = useState(true);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [nearbyEvents, setNearbyEvents] = useState<Event[]>([]);
  const [nearbySpaces, setNearbySpaces] = useState<Space[]>([]);
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
      // Leave the widget on its last good snapshot rather than blanking it offline.
      setUpcomingTickets([]);
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
      const userSpaces = await getUserSpaces(token);
      setMySpaces(uniqueSpaces(userSpaces ?? []).slice(0, 10));
    } catch (error) {
      if (__DEV__) console.error('Failed to load user spaces:', error);
      setMySpaces([]);
    } finally {
      setIsLoadingMySpaces(false);
    }
  }, [user]);

  const loadAllSpaces = useCallback(async () => {
    try {
      setIsLoadingAllSpaces(true);
      const response = await getAllSpaces({ page: 1, limit: 8 });
      setAllSpaces(response.spaces);
    } catch (error) {
      if (__DEV__) console.error('Failed to load all spaces:', error);
      setAllSpaces([]);
    } finally {
      setIsLoadingAllSpaces(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      setCategories(await getCategories());
    } catch {
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
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

  const loadSessions = useCallback(async () => {
    try {
      setIsLoadingSessions(true);
      setSessions(await listSessions());
    } catch {
      setSessions([]);
    } finally {
      setIsLoadingSessions(false);
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

  // Resolve the "Beyond by Unifesto" space by name, then load its events.
  const loadBeyond = useCallback(async () => {
    try {
      setIsLoadingBeyond(true);
      const resp = await getAllSpaces({ search: BEYOND_SPACE_NAME, limit: 5 });
      const list = resp?.spaces || [];
      // Prefer an exact name match; fall back to the top search hit.
      const match =
        list.find((s: Space) => s.name?.trim().toLowerCase() === BEYOND_SPACE_NAME.toLowerCase()) ||
        list[0] ||
        null;
      if (!match) {
        setBeyondSpace(null);
        setBeyondEvents([]);
        return;
      }
      setBeyondSpace(match);
      const res = await getSpaceEvents(match.id, 1, 10);
      setBeyondEvents(res?.events || []);
    } catch {
      setBeyondSpace(null);
      setBeyondEvents([]);
    } finally {
      setIsLoadingBeyond(false);
    }
  }, []);

  // Fetch city-scoped events & spaces once we know the user's city
  const loadNearby = useCallback(async (city: string) => {
    try {
      setIsLoadingNearby(true);
      const [eventsRes, spacesRes] = await Promise.all([
        getEvents({ page: 1, limit: 10, city }),
        getAllSpaces({ page: 1, limit: 8, city }),
      ]);
      setNearbyEvents(eventsRes?.data || eventsRes?.events || []);
      setNearbySpaces(spacesRes?.spaces || []);
    } catch {
      setNearbyEvents([]);
      setNearbySpaces([]);
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
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const place = places?.[0];
      const city = place?.city || place?.subregion || place?.region || null;
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
    loadSessions();
    loadBeyond();
    loadFavorites();
    loadLocation();
  }, [loadProfile, loadUpcomingTickets, loadMySpaces, loadAllSpaces, loadCategories, loadEvents, loadSessions, loadBeyond, loadFavorites, loadLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadProfile(),
        loadUpcomingTickets(),
        loadMySpaces(),
        loadAllSpaces(),
        loadEvents(),
        loadSessions(),
        loadBeyond(),
        loadFavorites(),
        detectedCity ? loadNearby(detectedCity) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, loadUpcomingTickets, loadMySpaces, loadAllSpaces, loadEvents, loadSessions, loadBeyond, loadFavorites, loadNearby, detectedCity]);

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
  // Nearby city events lead the hero; curated popular picks backfill so it's
  // never empty. Sub-events roll up to their super event.
  // Memoised: a fresh array every render would re-render the whole carousel.
  const heroEvents = useMemo(
    () => rollUpToSuperEvents(buildPopularEvents(detectedCity ? nearbyEvents : [], popularEvents, [])),
    [detectedCity, nearbyEvents, popularEvents],
  );
  const isLoadingHero = isLoadingEvents || locationStatus === 'loading' || (detectedCity ? isLoadingNearby : false);

  const showNearbySpaces = !!detectedCity && nearbySpaces.length > 0;

  const discoverSpaces = showNearbySpaces ? nearbySpaces : allSpaces;
  const isLoadingDiscoverSpaces = isLoadingAllSpaces || (detectedCity ? isLoadingNearby : false);

  return {
    user,
    profile,
    refreshing,
    onRefresh,

    upcomingTickets,
    isLoadingTickets,

    heroEvents,
    isLoadingHero,
    trendingEvents,
    popularEvents,
    isLoadingEvents,
    eventsFailed,

    favoriteEvents,
    isLoadingFavorites,

    mySpaces,
    isLoadingMySpaces,
    allSpaces,
    discoverSpaces,
    showNearbySpaces,
    isLoadingDiscoverSpaces,

    categories,
    isLoadingCategories,

    sessions,
    isLoadingSessions,

    beyondSpace,
    beyondEvents,
    isLoadingBeyond,

    detectedCity,
    locationStatus,
    loadLocation,
    canAskLocation,
  };
}

export type HomeData = ReturnType<typeof useHomeData>;
