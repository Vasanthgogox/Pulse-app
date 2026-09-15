import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

export default function ComplianceLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
