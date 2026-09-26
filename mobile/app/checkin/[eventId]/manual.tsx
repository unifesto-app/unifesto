import { Stack } from 'expo-router';
import ManualCheckinScreen from '../../../src/screens/ManualCheckinScreen';

export default function ManualCheckin() {
  return (
    <>
      <Stack.Screen options={{ title: 'Find an attendee', headerShown: true }} />
      <ManualCheckinScreen />
    </>
  );
}
