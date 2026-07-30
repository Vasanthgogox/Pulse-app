import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import { Suspense, lazy } from "react";

const FleetOperationsDashboardScreen = lazy(() =>
  import("@/features/trips/screens/FleetOperationsDashboardScreen").then((m) => ({
    default: m.FleetOperationsDashboardScreen,
  })),
);

export default function FleetOperationsRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading fleet operations…" />}>
      <FleetOperationsDashboardScreen />
    </Suspense>
  );
}
