import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

/** Session gate owned by NavigationPolicy (Phase 5). */
export default function ReachCampaignLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
