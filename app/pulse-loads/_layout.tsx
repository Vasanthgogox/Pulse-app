import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

export default function PulseLoadsLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
