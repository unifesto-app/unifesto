import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Old "manage seats" route. Seats are managed on the Manage group screen now
 * (same invite / revoke / release / reopen actions); forward any old links.
 */
export default function ManageSeatsRedirect() {
  const { registrationId } = useLocalSearchParams<{ registrationId: string }>();
  return <Redirect href={`/group/${registrationId}`} />;
}
