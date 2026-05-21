import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense } from "react";

const TripsScreen = lazy(() => import("./_trips-screen"));

export default function TripsTab() {
  return (
    <Suspense fallback={<LazySuspenseNullFallback />}>
      <TripsScreen />
    </Suspense>
  );
}
