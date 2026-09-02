import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

/** Session gate owned by NavigationPolicy (Phase 5), same as pulse-loads. */
export default function FindLoadsLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
