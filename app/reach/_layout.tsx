import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

/** Session gate owned by NavigationPolicy (Phase 5). */
export default function ReachLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
