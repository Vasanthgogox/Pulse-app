import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { TollEntryScreen } from "@/features/trips/operations/toll/TollEntryScreen";
import { driverExpenseEntryHref } from "@/features/trips/operations/shared/driverExpenseCategoryNav.util";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function TripTollEditRoute({
  tripId,
  entryId,
}: {
  tripId: string;
  entryId: string;
}) {
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
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
    if (loading) return <CenteredLoadingView message="Loading toll entry..." />;
    if (error || !trip) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: "#64748b", fontSize: 14 }}>{error ?? "Trip not found"}</Text>
        </View>
      );
    }
    return <TollEntryScreen trip={trip} entryId={entryId} />;
  }, [entryId, error, loading, trip]);
}

export default function TripTollEntryRoute() {
  const params = useLocalSearchParams<{ id?: string | string[]; entryId?: string | string[] }>();
  const tripId = readParam(params.id);
  const entryId = readParam(params.entryId);

  if (!entryId && tripId) {
    return (
      <Redirect href={driverExpenseEntryHref(tripId, { kind: "toll" }) as Href} />
    );
  }

  if (!tripId || !entryId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ color: "#64748b", fontSize: 14 }}>Trip not found.</Text>
      </View>
    );
  }

  return <TripTollEditRoute tripId={tripId} entryId={entryId} />;
}
