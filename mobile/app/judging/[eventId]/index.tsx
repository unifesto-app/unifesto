import { Stack, useLocalSearchParams } from 'expo-router';
import JudgingEventScreen from '../../../src/screens/JudgingEventScreen';

export default function JudgingEvent() {
  const { title } = useLocalSearchParams<{ eventId: string; title?: string }>();
  return (
    <>
      <Stack.Screen
        options={{
          title: title || 'Judging',
          headerShown: true,
        }}
      />
      <JudgingEventScreen />
    </>
  );
}
