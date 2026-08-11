import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

export default function MyFleetLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
