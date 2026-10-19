import { Stack } from 'expo-router';
import EventRequestScreen from '../src/screens/EventRequestScreen';

export default function EventRequest() {
  return (
    <>
      <Stack.Screen options={{ title: 'Host one event', headerShown: true }} />
      <EventRequestScreen />
    </>
  );
}
