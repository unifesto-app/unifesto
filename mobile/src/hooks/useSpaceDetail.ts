import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/AuthContext';
import { shareLink } from '../lib/share';
import { withUtm } from '../services/utm';
import { trackPageView } from '../services/pageViews';
import type { Event } from '../lib/api/events';
import {
  getSpaceById,
  getSpaceBySlug,
  getSpaceEvents,
  getSubSpaces,
  joinSpace,
  leaveSpace,
  type Space,
} from '../lib/api/spaces';
import { AppAlert } from '../components/ui/AppAlert';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin-tier roles run the space: they can't "leave" it and aren't shown to
// attendees. The retired ORGANISER family is kept so older sessions behave.
const ADMIN_CODES = new Set(['SPACE_ADMIN', 'ADMIN', 'ORGANISER', 'ORGANIZER', 'SUPER_ORGANISER', 'CO_ORGANISER', 'CO-ORGANISER']);

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
}

/**
 * Everything the space page needs, loaded once: the space (by id or slug —
 * shared links use the slug), its events split upcoming/past, parent and
 * sub-spaces, the public team, and membership + page actions.
 */
export function useSpaceDetail(idOrSlug: string | undefined) {
  const router = useRouter();
  const { user, token } = useAuth();

  const [space, setSpace] = useState<Space | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [parent, setParent] = useState<Space | null>(null);
  const [subSpaces, setSubSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!idOrSlug) {
      setLoading(false);
      return;
    }
    try {
      const data = UUID.test(idOrSlug)
        ? await getSpaceById(idOrSlug, token || undefined)
        : await getSpaceBySlug(idOrSlug, token || undefined);
      setSpace(data);
      if (!data) return;

      const parentId = data.parentSpaceId || data.parent_org_id;
      const [eventsRes, parentRes, subsRes] = await Promise.all([
        getSpaceEvents(data.id, 1, 30, true).catch(() => null),
        parentId ? getSpaceById(parentId, token || undefined).catch(() => null) : Promise.resolve(null),
        getSubSpaces(data.id).catch(() => ({ spaces: [] as Space[] })),
      ]);
      // Top-level events only: sub-events live inside their big event.
      setEvents(((eventsRes?.events ?? []) as Event[]).filter((e) => !e.parentEvent));
      setParent(parentRes);
      setSubSpaces(subsRes?.spaces ?? []);
    } catch (error) {
      if (__DEV__) console.error('Error loading space:', error);
      setSpace(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [idOrSlug, token]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // One page view per space opened (trackPageView drops refresh repeats).
  const viewedId = space?.id;
  const viewedSlug = space?.slug;
  useEffect(() => {
    if (viewedId) void trackPageView('space', viewedId, viewedSlug);
  }, [viewedId, viewedSlug]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isMember = !!space?.userRole;
  const roleCode = space?.userRole?.code?.toUpperCase();
  const runsSpace = !!roleCode && ADMIN_CODES.has(roleCode);
  const canLeave = !!user && isMember && !runsSpace;
  const brandColor = space?.branding?.color || null;
  const memberCount = space?.member_count || space?._count?.userRoles || 0;

  const now = Date.now();
  const at = (e: Event) => new Date(e.startDateTime).getTime();
  const isPast = (e: Event) => e.status === 'COMPLETED' || at(e) < now;
  const upcoming = events.filter((e) => !isPast(e) && e.status !== 'CANCELLED').sort((a, b) => at(a) - at(b));
  const past = events.filter(isPast).sort((a, b) => at(b) - at(a));

  // Public team: the curators and co-curators of the space's events (the API
  // leaves out space admins and crew).
  const team: TeamMember[] = (space?.team ?? []).map((m) => ({
    id: m.id,
    name: m.fullName || m.username || 'Curator',
    avatarUrl: m.avatarUrl,
    role: m.roleCode === 'CO_CURATOR' ? 'Co-curator' : 'Curator',
  }));

  const url = space ? `https://unifesto.app/space/${space.slug || space.id}` : '';
  const website = space?.websiteUrl || space?.website_url || null;

  // ── Actions ───────────────────────────────────────────────────────────────
  const join = async () => {
    if (!space) return;
    if (!user || !token) {
      AppAlert.alert('Sign in required', 'Please sign in to join this space.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    try {
      setMembershipBusy(true);
      try {
        await joinSpace(token, space.id);
      } catch (e: any) {
        if (!e?.message?.includes('already a member')) throw e;
      }
      await load(); // refresh role + member count
    } catch (e: any) {
      AppAlert.alert('Could not join', e?.message || 'Please try again.');
    } finally {
      setMembershipBusy(false);
    }
  };

  const confirmLeave = () => {
    if (!space || !token) return;
    AppAlert.alert('Leave space?', `You'll stop being a member of ${space.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            setMembershipBusy(true);
            await leaveSpace(token, space.id);
            await load();
          } catch (e: any) {
            AppAlert.alert('Could not leave', e?.message || 'Please try again.');
          } finally {
            setMembershipBusy(false);
          }
        },
      },
    ]);
  };

  const share = () => {
    if (!space) return;
    shareLink({
      message: `${space.name} on Unifesto`,
      url: withUtm(url, { source: 'unifesto_app', medium: 'share', campaign: 'space_share' }),
      title: space.name,
    });
  };

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(withUtm(url, { source: 'unifesto_app', medium: 'copy_link', campaign: 'space_share' }));
      AppAlert.alert('Link copied');
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  const visitWebsite = () => {
    if (!website) return;
    const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    Linking.openURL(normalized).catch(() => AppAlert.alert('Unable to open link', 'The website link looks invalid.'));
  };

  return {
    user,
    space,
    loading,
    refreshing,
    refresh,
    brandColor,
    memberCount,
    isMember,
    canLeave,
    membershipBusy,
    upcoming,
    past,
    parent,
    subSpaces,
    team,
    website,
    join,
    confirmLeave,
    share,
    copyLink,
    visitWebsite,
  };
}

export type SpaceDetail = ReturnType<typeof useSpaceDetail>;
