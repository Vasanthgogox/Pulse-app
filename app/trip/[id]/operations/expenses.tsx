import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { TripExpensesScreen } from "@/features/trips/operations/hub/TripExpensesScreen";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

export default function TripExpenseControlRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const tripId =
    typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const safeBack = useSafeBack();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    if (!tripId) {
      setLoading(false);
      setError("Trip not found.");
      return;
    }
    void getTripById(tripId).then((res) => {
      if (!mounted) return;
      setTrip(res.trip ?? null);
      setError(res.error ? res.error.message : res.trip ? null : "Trip not found.");
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [tripId]);

  return useMemo(() => {
    if (loading) return <CenteredLoadingView message="Loading expense control..." />;
    if (error || !trip) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: "#64748b", fontSize: 14 }}>{error ?? "Trip not found"}</Text>
        </View>
      );
    }
    return (
      <TripExpensesScreen
        trip={trip}
        onBack={safeBack}
        onAddFuel={() => router.push(ROUTES.tripFuelEntry(trip.id))}
        onAddToll={() => router.push(ROUTES.tripTollEntry(trip.id))}
      />
    );
  }, [error, loading, router, safeBack, trip]);
}
