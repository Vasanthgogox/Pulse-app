/**
 * Trip history segment — list (index) + full-screen trip detail ([tripId]).
 */
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { Stack } from "expo-router";

export default function TripHistoryLayout() {
  return (
    <Stack screenOptions={routeStackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="[tripId]"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
    </Stack>
  );
}
