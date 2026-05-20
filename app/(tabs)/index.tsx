import { Redirect } from "expo-router";

/** Tabs root redirects to the primary trips tab. */
export default function TabsIndexRedirect() {
  return <Redirect href="/(tabs)/trips" />;
}
