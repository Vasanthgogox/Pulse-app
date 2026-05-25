import { useAuth } from '@/contexts/AuthContext';
import { ROUTES } from '@/lib/routes';
import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Stack } from 'expo-router';

export default function PulseLoadsLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(ROUTES.SIGN_IN_DIRECT);
    }
  }, [loading, user, router]);

  return <Stack screenOptions={routeStackScreenOptions} />;
}
