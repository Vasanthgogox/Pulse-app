import { usePushTokenRegistration } from "@/features/notifications/hooks/usePushTokenRegistration";
import { useAuth } from "@/contexts/AuthContext";

/** Mount once under AuthProvider — registers Expo push token for chat alerts. */
export function PushTokenRegistration() {
  const { user, roleVerified } = useAuth();
  usePushTokenRegistration(!!user && roleVerified);
  return null;
}
