import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

/** Public — no session gate. See lib/navigationPolicy/registry/public.ts (public.referral-landing). */
export default function ReferralLandingLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
