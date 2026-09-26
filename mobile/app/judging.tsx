import { Stack } from 'expo-router';
import JudgingListScreen from '../src/screens/JudgingListScreen';

export default function Judging() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Judging',
          headerShown: true,
        }}
      />
      <JudgingListScreen />
    </>
  );
}
