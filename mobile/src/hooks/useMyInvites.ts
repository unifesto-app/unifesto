import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { AppAlert } from '../components/ui/AppAlert';
import { declineSeat, getMyInvites, type MyInvite } from '../lib/api/registrations';

/**
 * Group-seat invites waiting for me. Re-fetched whenever the screen regains
 * focus, so a card disappears as soon as the invite is claimed or declined.
 * `decline` is the only way to clear a card: it hands the seat back to the
 * lead, so an invite never just vanishes from the app while still pending.
 */
export function useMyInvites() {
  const { token } = useAuth();
  const [invites, setInvites] = useState<MyInvite[]>([]);

  const refresh = useCallback(async () => {
    if (!token) {
      setInvites([]);
      return;
    }
    setInvites(await getMyInvites());
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const decline = useCallback((inviteToken: string) => {
    AppAlert.alert('Decline this invite?', 'Your seat goes back to the group so your team lead can invite someone else.', [
      { text: 'Keep my seat', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await declineSeat(inviteToken);
            setInvites((prev) => prev.filter((i) => i.token !== inviteToken));
          } catch (e: any) {
            AppAlert.alert("Couldn't decline", e?.message || 'Please try again.');
          }
        },
      },
    ]);
  }, []);

  return { invites, refresh, decline };
}
