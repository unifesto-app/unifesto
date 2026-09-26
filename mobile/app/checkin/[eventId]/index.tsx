import { Stack } from 'expo-router';
import EventCheckinScreen from '../../../src/screens/EventCheckinScreen';

export default function EventCheckin() {
  return (
    <>
      <Stack.Screen options={{ title: 'Check-in', headerShown: true }} />
      <EventCheckinScreen />
    </>
  );
}
