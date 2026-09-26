import { Stack } from 'expo-router';
import RegistrationSuccessScreen from '../src/screens/RegistrationSuccessScreen';

export default function RegistrationSuccess() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Registration successful',
          headerShown: false,
          presentation: 'modal',
          // Terminal screen: no swipe back into the finished registration.
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
      <RegistrationSuccessScreen />
    </>
  );
}
