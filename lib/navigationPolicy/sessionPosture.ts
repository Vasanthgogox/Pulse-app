import type { AuthStatus } from '@/lib/authEngine';
import type { SessionPosture } from '@/lib/navigationPolicy/types';

/** Map AuthContext status → Navigation Policy session posture (RFC). */
export function authStatusToSessionPosture(status: AuthStatus): SessionPosture {
  switch (status) {
    case 'restoring':
      return 'restoring';
    case 'unauthenticated':
      return 'anonymous';
    case 'authenticated':
      return 'authenticated';
    case 'expired':
      return 'expired';
    default:
      return 'restoring';
  }
}
