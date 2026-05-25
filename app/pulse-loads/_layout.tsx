import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES } from '@/lib/routes';
import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Stack } from 'expo-router';

export default function PulseLoadsLayout() {
  const { user, profile, roleVerified, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile || !roleVerified) {
      router.replace(ROUTES.SIGN_IN_DIRECT);
    }
  }, [loading, user, profile, roleVerified, router]);

  if (loading || !user || !profile || !roleVerified) {
    return <AppLoadingSplash variant={loading ? 'session' : 'verify'} style={{ flex: 1 }} />;
  }

  return <Stack screenOptions={routeStackScreenOptions} />;
}
