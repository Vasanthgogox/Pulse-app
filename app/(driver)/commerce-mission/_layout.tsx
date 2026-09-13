import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

export default function CommerceMissionLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
