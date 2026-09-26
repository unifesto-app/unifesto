import { Stack } from 'expo-router';
import EventRegistrationScreen from '../src/screens/EventRegistrationScreen';

export default function EventRegistration() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Event registration',
          headerShown: false,
          presentation: 'modal',
          // No swipe-back: leaving goes through the close button's confirm, so a
          // stray edge swipe can't throw away the ticket choice and details.
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
      <EventRegistrationScreen />
    </>
  );
}
