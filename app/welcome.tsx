import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { ROUTES } from '@/lib/routes';

/** Legacy `/welcome` — redirects to persona hub (welcome split screen removed). */
export default function WelcomeRedirect() {
  const { user } = useAuth();

  if (user) {
    return <Redirect href={ROUTES.INDEX} />;
  }

  return <Redirect href={ROUTES.ONBOARDING.HUB} />;
}
