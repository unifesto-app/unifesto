import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getCheckinStats, getRecentCheckins, type CheckinStats, type RecentCheckin } from '../lib/api/checkin';

const RECENT_LIMIT = 8;

/**
 * Live numbers for one event's check-in hub. Reloads every time the screen
 * regains focus, so coming back from the scanner shows fresh counts.
 * `pointId` = '' means all points.
 */
export function useCheckinHub(eventId: string, pointId: string) {
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [recent, setRecent] = useState<RecentCheckin[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError('');
    const [s, r] = await Promise.allSettled([
      getCheckinStats(eventId, pointId || undefined),
      getRecentCheckins(eventId, RECENT_LIMIT),
    ]);
    if (mine !== seq.current) return; // a newer point / refresh won
    if (s.status === 'fulfilled') setStats(s.value);
    else setError(s.reason instanceof Error ? s.reason.message : 'Could not load check-in stats');
    setRecent(r.status === 'fulfilled' ? r.value : []);
    setLoading(false);
    setRefreshing(false);
  }, [eventId, pointId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const retry = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { stats, recent, loading, refreshing, error, refresh, retry };
}
