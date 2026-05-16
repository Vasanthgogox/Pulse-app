import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import type { TripDetailScreenProps } from "@/features/trips/components/trip-detail/TripDetailScreen.types";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import { Suspense, lazy } from "react";

const TripDetailScreen = lazy(
  () => import("@/features/trips/components/trip-detail/TripDetailScreen"),
);

export default function TripDetailRoute() {
  const raw = useLocalSearchParams<{
    id: string;
    entryContext?: string;
    clientIdFromContext?: string;
    clientNameFromContext?: string;
  }>();
  const safeBack = useSafeBack();
  const tripId = typeof raw.id === "string" ? raw.id : raw.id?.[0] ?? "";
  const entryContext =
    typeof raw.entryContext === "string" &&
    (raw.entryContext === "supplier" ||
      raw.entryContext === "vehicle" ||
      raw.entryContext === "client")
      ? (raw.entryContext as TripDetailScreenProps["entryContext"])
      : undefined;
  const clientIdFromContext =
    typeof raw.clientIdFromContext === "string"
      ? raw.clientIdFromContext
      : undefined;
  const clientNameFromContext =
    typeof raw.clientNameFromContext === "string"
      ? raw.clientNameFromContext
      : undefined;

  const screenProps: TripDetailScreenProps = {
    tripId,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    onBack: safeBack,
  };

  return (
    <Suspense fallback={<CenteredLoadingView message="Loading trip…" />}>
      <TripDetailScreen {...screenProps} />
    </Suspense>
  );
}
