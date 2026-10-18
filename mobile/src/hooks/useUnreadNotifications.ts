import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getUnreadNotificationCount } from '../lib/api/hackathon';
import { onNotificationArrived } from '../lib/notificationBus';

/** Unread in-app notifications for the bell. Refetched on focus and when a push lands. */
export function useUnreadNotifications(): number {
  const { token } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!token) return setCount(0);
    const res = await getUnreadNotificationCount();
    if (res.ok) setCount(res.data.count);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => onNotificationArrived(() => void refresh()), [refresh]);

  return count;
}
