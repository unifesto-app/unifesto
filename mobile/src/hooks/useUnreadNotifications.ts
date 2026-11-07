import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { getUnreadNotificationCount } from '../lib/api/hackathon';
import { onNotificationArrived } from '../lib/notificationBus';

/** The app icon badge follows the bell (C13); needs no permission beyond push's. */
const setBadge = (n: number) => void Notifications.setBadgeCountAsync(n).catch(() => {});

/** Unread in-app notifications for the bell. Refetched on focus and when a notification lands. */
export function useUnreadNotifications(): number {
  const { token } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!token) {
      setBadge(0);
      return setCount(0);
    }
    const res = await getUnreadNotificationCount();
    if (res.ok) {
      setCount(res.data.count);
      setBadge(res.data.count);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => onNotificationArrived(() => void refresh()), [refresh]);

  return count;
}
