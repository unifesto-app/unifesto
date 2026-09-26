import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

/** The backend's single platform-staff role (Apex's ADMIN_ROLE_CODES). */
const PLATFORM_ADMIN_ROLE = 'ADMIN';

/**
 * True when the signed-in user is Unifesto platform staff — the only people who
 * get the Apex tab. Mirrors Apex's own gate (a platform `ADMIN` UserRole); the
 * server still enforces @Roles(ADMIN) on every call the tab makes.
 *
 * Login responses carry no `roles`, only GET /users/me does, so a fresh sign-in
 * triggers one profile refetch to learn the answer.
 */
export default function usePlatformAdmin(): boolean {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || user.roles !== undefined) return;
    if (askedFor.current === user.id) return;
    askedFor.current = user.id;
    void refreshUser();
  }, [isAuthenticated, user?.id, user?.roles, refreshUser]);

  return !!user?.roles?.some((r) => r.role?.code === PLATFORM_ADMIN_ROLE);
}
