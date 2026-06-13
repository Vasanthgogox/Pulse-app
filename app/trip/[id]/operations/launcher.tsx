import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ROUTES } from "@/lib/routes";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

/** Legacy launcher route — opens the unified driver expense form directly. */
export default function TripExpenseLauncherRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const tripId = readParam(params.id);
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!tripId) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: "#64748b", fontSize: 14 }}>{error ?? "Trip not found"}</Text>
        </View>
      );
    }
    if (loading) return <CenteredLoadingView message="Loading…" />;
    if (error || !trip) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: "#64748b", fontSize: 14 }}>{error ?? "Trip not found"}</Text>
        </View>
      );
    }
    return <Redirect href={ROUTES.tripOtherExpenseEntry(tripId) as never} />;
  }, [error, loading, trip, tripId]);
}
