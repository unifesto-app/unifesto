import { Stack } from 'expo-router';
import CheckinListScreen from '../src/screens/CheckinListScreen';

export default function Checkin() {
  return (
    <>
      <Stack.Screen options={{ title: 'Check-in', headerShown: true }} />
      <CheckinListScreen />
    </>
  );
}
