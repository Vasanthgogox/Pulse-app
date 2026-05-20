import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

/** Trip detail stack — keeps `/trip/[id]` lazy bundles isolated from tabs/chat. */
export default function TripLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
