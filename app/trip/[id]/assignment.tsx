import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import type { AssignmentFlowFocus } from "@/features/trips/components/trip-detail/TripAssignmentFlowScreen";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import { Suspense, lazy } from "react";

const TripAssignmentFlowScreen = lazy(
  () =>
    import("@/features/trips/components/trip-detail/TripAssignmentFlowScreen").then(
      (m) => ({ default: m.TripAssignmentFlowScreen }),
    ),
);

export default function TripAssignmentRoute() {
  const params = useLocalSearchParams<{
    id: string;
    focus?: string;
  }>();
  const safeBack = useSafeBack();
  const tripId = typeof params.id === "string" ? params.id : (params.id?.[0] ?? "");
  const focusRaw = typeof params.focus === "string" ? params.focus : params.focus?.[0];
  const initialFocus: AssignmentFlowFocus =
    focusRaw === "vehicle" ? "vehicle" : "driver";

  if (!tripId) {
    return (
      <LazySuspenseInlineFallback message="Missing trip" />
    );
  }

  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading…" />}>
      <TripAssignmentFlowScreen
        tripId={tripId}
        initialFocus={initialFocus}
        onBack={safeBack}
      />
    </Suspense>
  );
}
