import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import TicketDetailScreen from '../../src/screens/TicketDetailScreen';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { readUpNextSnapshot } from '../../src/widgets/sync';
import { fetchUpcomingTickets } from '../../src/lib/upcomingTickets';
import { useCosmos } from '../../src/theme/cosmos';

// The screen reads the ticket from the route params and owns its header
// actions (share "I'm going", calendar, view event, report).
export default function TicketDetail() {
  const { id, ticket } = useLocalSearchParams<{ id: string; ticket?: string }>();
  const router = useRouter();
  const c = useCosmos();
  // A home-screen widget tap or a booking push (Q10) arrives as a bare
  // unifesto://ticket/<eventId> link with no snapshot param: recover the ticket
  // the widget was drawn from, else fetch it (just booked, not saved yet).
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (ticket || !id) return;
    let cancelled = false;
    readUpNextSnapshot().then(async (snap) => {
      const saved =
        snap.full[id] ??
        (await fetchUpcomingTickets(20)
          .then((all) => all.find((t: any) => String(t.id) === id))
          .catch(() => undefined));
      if (cancelled) return;
      if (saved) router.setParams({ ticket: JSON.stringify(saved) });
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, ticket, router]);

  if (!ticket) {
    if (missing) return <Redirect href="/tickets" />;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <CosmosBackdrop horizon={false} />
        <ActivityIndicator color={c.text} accessibilityLabel="Loading ticket" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'My ticket', headerShown: true }} />
      <TicketDetailScreen />
    </>
  );
}
