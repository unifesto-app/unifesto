import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import TicketDetailScreen from '../../src/screens/TicketDetailScreen';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { readUpNextSnapshot } from '../../src/widgets/sync';
import { useCosmos } from '../../src/theme/cosmos';

// The screen reads the ticket from the route params and owns its header
// actions (share "I'm going", calendar, view event, report).
export default function TicketDetail() {
  const { id, ticket } = useLocalSearchParams<{ id: string; ticket?: string }>();
  const router = useRouter();
  const c = useCosmos();
  // A home-screen widget tap arrives as a bare unifesto://ticket/<id> link with no
  // snapshot param, so recover the ticket the widget was drawn from.
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (ticket || !id) return;
    let cancelled = false;
    readUpNextSnapshot().then((snap) => {
      if (cancelled) return;
      const saved = snap.full[id];
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
