import { Redirect } from "expo-router";

/**
 * Tabs root should always land on a primary list tab.
 * Keep Ops Agent on its own hidden route to avoid accidental fallback.
 */
export default function TabsIndexRedirect() {
  return <Redirect href="/(tabs)/trips" />;
}
