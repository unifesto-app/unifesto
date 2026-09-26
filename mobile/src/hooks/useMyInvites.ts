import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { getMyInvites, type MyInvite } from '../lib/api/registrations';

// Invite tokens the user chose to hide from Home. A revoked + re-sent invite
// gets a new token, so it shows up again.
const DISMISSED_KEY = 'home.dismissedInvites';

async function readDismissed(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Group-seat invites waiting for me, minus ones I've hidden. Re-fetched
 * whenever the screen regains focus, so a card disappears as soon as the
 * invite is claimed or declined. Claiming is never required: `dismiss`
 * hides an invite from Home (it stays claimable from the email link).
 */
export function useMyInvites() {
  const { token } = useAuth();
  const [invites, setInvites] = useState<MyInvite[]>([]);

  const refresh = useCallback(async () => {
    if (!token) {
      setInvites([]);
      return;
    }
    const [all, dismissed] = await Promise.all([getMyInvites(), readDismissed()]);
    setInvites(all.filter((i) => !dismissed.includes(i.token)));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const dismiss = useCallback(async (inviteToken: string) => {
    setInvites((prev) => prev.filter((i) => i.token !== inviteToken));
    const dismissed = await readDismissed();
    // Keep the list short; old tokens are dead anyway.
    const next = [inviteToken, ...dismissed.filter((t) => t !== inviteToken)].slice(0, 50);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { invites, refresh, dismiss };
}
