import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Signup deep-link handler. Historically captured a referral code; the referral
 * system has been removed, so this now simply routes into the login flow.
 */
export default function SignupDeepLink() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, []);

  return null;
}
