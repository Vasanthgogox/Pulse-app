import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import { useLocalSearchParams } from "expo-router";
import { Suspense, lazy } from "react";

const TripTrackTraceScreen = lazy(() =>
  import("@/features/trips/screens/TripTrackTraceScreen").then((m) => ({
    default: m.TripTrackTraceScreen,
  })),
);

export default function TrackTripRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading tracking…" />}>
      <TripTrackTraceScreen tripId={tripId} />
    </Suspense>
  );
}
