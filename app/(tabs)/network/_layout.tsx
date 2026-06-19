import { Stack } from 'expo-router';

import { routeStackScreenOptions } from '@/lib/routeStackOptions';

/** Nested stack: classic feed (`index`) vs org hub (`hub`). */
export default function NetworkTabLayout() {
  return (
    <Stack
      screenOptions={{
        ...routeStackScreenOptions,
        animation: 'none',
      }}
    />
  );
}
