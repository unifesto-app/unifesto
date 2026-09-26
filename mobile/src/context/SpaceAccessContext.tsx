import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { getMyOperatorSpaces } from '../lib/api/spaceAccess';
import { getMyCheckinEvents } from '../lib/api/checkin';
import { getMyJudgingEvents } from '../lib/api/leaderboard';
import { getMySponsorships } from '../lib/api/sponsorPortal';
import { resolveSpaceSections, type SpaceAccessData, type SpaceSection } from '../lib/spaceSections';

interface SpaceAccessContextType extends SpaceAccessData {
  /** Sections the Space tab shows, in order. Empty ⇒ the tab is hidden. */
  sections: SpaceSection[];
  /** True once the first load for this session has finished. */
  loaded: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: SpaceAccessData = { spaces: [], checkinEvents: [], judgingEvents: [], sponsorships: [] };

// Roles change rarely; re-check on foreground at most this often.
const FOREGROUND_REFRESH_MS = 5 * 60 * 1000;

const SpaceAccessContext = createContext<SpaceAccessContextType | undefined>(undefined);

/**
 * Decides whether the signed-in user gets the Space tab and feeds its content.
 * Composes four existing endpoints (operator spaces, check-in events, judging
 * events, sponsor portal) so the tab ships without a backend change.
 */
export function SpaceAccessProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [data, setData] = useState<SpaceAccessData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const lastLoadAt = useRef(0);
  // Drops a response that lands after the user signed out or switched account.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    if (!isAuthenticated) {
      setData(EMPTY);
      setLoaded(true);
      return;
    }
    const [spaces, checkin, judgingEvents, sponsorships] = await Promise.all([
      getMyOperatorSpaces(),
      getMyCheckinEvents().catch(() => ({ events: [] })),
      getMyJudgingEvents(),
      getMySponsorships(),
    ]);
    if (gen !== generation.current) return;
    lastLoadAt.current = Date.now();
    setData({ spaces, checkinEvents: checkin.events ?? [], judgingEvents, sponsorships });
    setLoaded(true);
  }, [isAuthenticated]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh, user?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastLoadAt.current > FOREGROUND_REFRESH_MS) {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<SpaceAccessContextType>(
    () => ({ ...data, sections: resolveSpaceSections(data, new Date()), loaded, refresh }),
    [data, loaded, refresh],
  );

  return <SpaceAccessContext.Provider value={value}>{children}</SpaceAccessContext.Provider>;
}

export function useSpaceAccess(): SpaceAccessContextType {
  const ctx = useContext(SpaceAccessContext);
  if (!ctx) throw new Error('useSpaceAccess must be used inside SpaceAccessProvider');
  return ctx;
}
