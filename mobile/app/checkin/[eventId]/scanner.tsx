import { Stack, useLocalSearchParams } from 'expo-router';
import CheckinScannerScreen from '../../../src/screens/CheckinScannerScreen';

export default function CheckinScanner() {
  const { eventId, checkinTypeId } = useLocalSearchParams<{ eventId: string; checkinTypeId?: string }>();
  return (
    <>
      {/* The camera is dark in every theme, so the header is always white on it. */}
      <Stack.Screen
        options={{
          title: 'Scan tickets',
          headerShown: true,
          headerTintColor: '#ffffff',
          headerTitleStyle: { color: '#ffffff' },
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <CheckinScannerScreen eventId={eventId} checkinTypeId={checkinTypeId || undefined} />
    </>
  );
}
