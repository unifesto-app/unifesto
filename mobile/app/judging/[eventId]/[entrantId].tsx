import { Stack, useLocalSearchParams } from 'expo-router';
import JudgingEntrantScreen from '../../../src/screens/JudgingEntrantScreen';

export default function JudgingEntrant() {
  const { roundName } = useLocalSearchParams<{
    eventId: string;
    entrantId: string;
    roundId: string;
    roundName?: string;
    entrantName?: string;
  }>();
  return (
    <>
      <Stack.Screen
        options={{
          title: roundName || 'Scoring',
          headerShown: true,
        }}
      />
      <JudgingEntrantScreen />
    </>
  );
}
