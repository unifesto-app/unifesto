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
  // While a fetch is out: Home's lists wait on the first one (also right after
  // signing in) so they can leave out invited events.
  const [loading, setLoading] = useState(!!token);
  // Signing in or out: loading again in this same render, before the fetch effect runs.
  const [loadingFor, setLoadingFor] = useState(token);
  if (token !== loadingFor) {
    setLoadingFor(token);
    setLoading(!!token);
  }

  const refresh = useCallback(async () => {
    if (token) {
      setLoading(true);
      setInvites(await getMyInvites()); // never throws
    } else setInvites([]);
    setLoading(false);
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

  return { invites, loading, refresh, decline };
}
