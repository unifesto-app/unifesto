import { Stack } from 'expo-router';
import SpaceRequestScreen from '../src/screens/SpaceRequestScreen';

export default function SpaceRequest() {
  return (
    <>
      <Stack.Screen options={{
        title: 'Request a space',
       headerShown: true,
      }} />
      <SpaceRequestScreen />
    </>
  );
}
