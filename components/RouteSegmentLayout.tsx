import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

/** Standard layout for a converted route folder (`index` + `loading`). */
export default function RouteSegmentLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
