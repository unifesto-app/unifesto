import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, type Href } from 'expo-router';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import usePlatformAdmin from './usePlatformAdmin';
import { activeEvents, adminSpaces, hostedSpaces } from '../lib/spaceSections';
import { getManagedSpaceEvents, type ManagedEvent } from '../lib/api/manageSpace';
import type { CheckinEvent } from '../lib/api/checkin';
import type { JudgingEvent } from '../lib/api/leaderboard';
import type { PortalSponsor } from '../lib/api/sponsorPortal';
import { pendingCounts } from '../lib/apexQueues';
import {
  getAdminPayouts,
  getAdminRefunds,
  getPlatformOverview,
  getWhatsappStats,
  type PlatformOverview,
} from '../lib/api/apex';
import { getTicketStats, listContentReports } from '../lib/api/apexSupport';

// Home is focused often; these panels don't need to be fresher than this.
const REFRESH_MS = 60 * 1000;
// Hosts with many spaces: only the first few feed the Home snapshot.
const MAX_SPACES = 4;
const MAX_EVENTS = 3;

export interface HostedEvent extends ManagedEvent {
  spaceName: string;
}

export interface ApexNeed {
  key: string;
  label: string;
  count: number;
  to: Href;
}

export interface WorkspaceData {
  showSpace: boolean;
  showApex: boolean;
  /** Check-in events running right now (started, not ended). */
  liveCheckins: CheckinEvent[];
  /** My hosted events that haven't ended, soonest first. */
  upcoming: HostedEvent[];
  loadingUpcoming: boolean;
  /** Spaces I host (capped); drives the empty state and "new event" target. */
  hostedSpaceIds: string[];
  /** Spaces I can create events in (Space Admin). */
  adminSpaceIds: string[];
  judging: JudgingEvent[];
  sponsorships: PortalSponsor[];
  overview: PlatformOverview | null;
  /** Non-zero Apex queues, busiest first. Empty + loaded ⇒ all clear. */
  needs: ApexNeed[];
  loadingApex: boolean;
  refresh: () => void;
}

/**
 * Home's snapshot of the operator tabs. Uses the same gates as the tab layouts
 * (Space: any operator section, Apex: platform ADMIN), so a panel shows exactly
 * when its tab does. Check-in / judging / sponsoring come free from
 * SpaceAccessContext; hosted events and Apex counts are fetched here.
 */
export function useWorkspaceCards(): WorkspaceData {
  const access = useSpaceAccess();
  const showApex = usePlatformAdmin();
  const showSpace = access.sections.length > 0;
  const hosted = hostedSpaces(access.spaces).slice(0, MAX_SPACES);
  const hostedKey = hosted.map((s) => s.id).join(',');

  const [upcoming, setUpcoming] = useState<HostedEvent[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [needs, setNeeds] = useState<ApexNeed[]>([]);
  const [loadingApex, setLoadingApex] = useState(true);
  const lastLoad = useRef({ key: '', at: 0 });

  const loadHosting = useCallback(async () => {
    if (!hostedKey) {
      setUpcoming([]);
      setLoadingUpcoming(false);
      return;
    }
    const now = Date.now();
    const lists = await Promise.all(
      hosted.map((s) =>
        getManagedSpaceEvents(s.id)
          .then((events) => events.map((e) => ({ ...e, spaceName: s.name })))
          .catch(() => [] as HostedEvent[]),
      ),
    );
    // Co-hosted events show up under both spaces; keep one.
    const seen = new Set<string>();
    const next = lists
      .flat()
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return e.status !== 'CANCELLED' && !e.parentEventId && new Date(e.endDateTime).getTime() >= now;
      })
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
      .slice(0, MAX_EVENTS);
    setUpcoming(next);
    setLoadingUpcoming(false);
  }, [hostedKey]);

  const loadApex = useCallback(async () => {
    if (!showApex) return;
    const [ov, queues, refunds, payouts, reports, support, wa] = await Promise.all([
      getPlatformOverview(),
      pendingCounts(),
      getAdminRefunds('PENDING_ADMIN'),
      getAdminPayouts('PENDING'),
      listContentReports({ status: 'OPEN' }),
      getTicketStats(),
      getWhatsappStats(),
    ]);
    setOverview(ov.ok ? ov.data : null);
    const requests = Object.values(queues).reduce<number>((sum, n) => sum + (n ?? 0), 0);
    const list: ApexNeed[] = [
      { key: 'requests', label: 'Requests', count: requests, to: '/apex/requests' },
      {
        key: 'refunds',
        label: 'Refunds',
        count: refunds.ok ? refunds.data.pagination?.total ?? refunds.data.requests.length : 0,
        to: '/apex/money/refunds',
      },
      {
        key: 'payouts',
        label: 'Settlements',
        count: payouts.ok ? payouts.data.pagination?.total ?? payouts.data.payouts.length : 0,
        to: '/apex/money/settlements',
      },
      { key: 'reports', label: 'Reports', count: reports.ok ? reports.data.length : 0, to: '/apex/reports' },
      { key: 'support', label: 'Support', count: support.ok ? support.data.open : 0, to: '/apex/support' },
      { key: 'whatsapp', label: 'WhatsApp', count: wa.ok ? wa.data.unread : 0, to: '/apex/whatsapp' },
    ];
    setNeeds(list.filter((n) => n.count > 0).sort((a, b) => b.count - a.count));
    setLoadingApex(false);
  }, [showApex]);

  const load = useCallback(
    (force: boolean) => {
      // Re-run when the set of hosted spaces or admin status changes, else throttle.
      const key = `${hostedKey}|${showApex}`;
      if (!force && key === lastLoad.current.key && Date.now() - lastLoad.current.at < REFRESH_MS) return;
      lastLoad.current = { key, at: Date.now() };
      void loadHosting();
      void loadApex();
    },
    [hostedKey, showApex, loadHosting, loadApex],
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  const refresh = useCallback(() => {
    void access.refresh();
    load(true);
  }, [access, load]);

  const now = new Date();
  const liveCheckins = activeEvents(access.checkinEvents, now).filter(
    (e) => new Date(e.startDateTime).getTime() <= now.getTime(),
  );

  return {
    showSpace,
    showApex,
    liveCheckins,
    upcoming,
    loadingUpcoming: loadingUpcoming && hosted.length > 0,
    hostedSpaceIds: hosted.map((s) => s.id),
    adminSpaceIds: adminSpaces(hosted).map((s) => s.id),
    judging: activeEvents(access.judgingEvents, now),
    sponsorships: access.sponsorships,
    overview,
    needs,
    loadingApex,
    refresh,
  };
}
