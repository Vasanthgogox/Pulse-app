import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DriverUnifiedExpenseEntryScreen } from "@/features/trips/operations/shared/DriverUnifiedExpenseEntryScreen";
import {
  parseDriverExpenseCategoryParam,
  parseDriverExpenseKindParam,
} from "@/features/trips/operations/shared/driverExpenseCategoryNav.util";
import { OtherExpenseEntryScreen } from "@/features/trips/operations/other/OtherExpenseEntryScreen";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default function TripOtherExpenseEntryRoute() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    entryId?: string | string[];
    category?: string | string[];
    kind?: string | string[];
  }>();
  const { profile } = useAuth();
  const tripId = readParam(params.id);
  const entryId = readParam(params.entryId);
  const initialCategory = parseDriverExpenseCategoryParam(readParam(params.category));
  const initialKind = parseDriverExpenseKindParam(readParam(params.kind));
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
    if (loading) return <CenteredLoadingView message="Loading expense entry..." />;
    if (error || !trip) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: "#64748b", fontSize: 14 }}>{error ?? "Trip not found"}</Text>
        </View>
      );
    }

    if (profile?.role === "driver") {
      return (
        <DriverUnifiedExpenseEntryScreen
          trip={trip}
          entryId={entryId || null}
          initialKind={initialKind}
          initialOtherCategory={initialCategory}
        />
      );
    }

    return (
      <OtherExpenseEntryScreen
        trip={trip}
        entryId={entryId || null}
        initialCategory={initialCategory}
      />
    );
  }, [entryId, error, initialCategory, initialKind, loading, profile?.role, trip]);
}
