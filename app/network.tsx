import { Redirect } from 'expo-router';

export default function NetworkLegacyRoute() {
  // Keep /network URL stable while always rendering the tab implementation.
  return <Redirect href="/(tabs)/network" />;
}
