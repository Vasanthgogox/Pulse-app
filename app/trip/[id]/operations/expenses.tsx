import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { TripExpensesScreen } from "@/features/trips/operations/hub/TripExpensesScreen";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTES, tripExpenseEntryEditRoute } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { getAccessibleTripById, type TripRow } from "@/features/trips/services/trips.service";
import { type Href, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

export default function TripExpenseControlRoute() {
  const params = useLocalSearchParams<{ id?: string | string[]; eventId?: string | string[] }>();
  const tripId =
    typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const eventIdRaw =
    typeof params.eventId === "string"
      ? params.eventId
      : Array.isArray(params.eventId)
        ? params.eventId[0]
        : "";
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const safeBack = useSafeBack();
  const router = useRouter();
  const { profile } = useAuth();

  useEffect(() => {
    let mounted = true;
    if (!tripId) {
      setLoading(false);
      setError("Trip not found.");
      return;
    }
    void getAccessibleTripById(tripId).then((res) => {
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

    if (profile?.role === "driver") {
      const query = new URLSearchParams({ tab: "operations" });
      if (eventIdRaw) query.set("eventId", eventIdRaw);
      const href =
        `/(driver)/trip-history/${encodeURIComponent(trip.id)}?${query.toString()}` as Href;
      return <Redirect href={href} />;
    }

    return (
      <TripExpensesScreen
        trip={trip}
        onBack={safeBack}
        onAddFuel={() => router.push(ROUTES.tripFuelEntry(trip.id) as never)}
        onAddToll={() => router.push(ROUTES.tripTollEntry(trip.id) as never)}
        onAddOtherExpense={() => router.push(ROUTES.tripOtherExpenseEntry(trip.id) as never)}
        onEditExpense={(event) => {
          const href = tripExpenseEntryEditRoute(trip.id, event.id);
          if (href) router.push(href as never);
        }}
        initialPreviewEventId={eventIdRaw || null}
      />
    );
  }, [error, eventIdRaw, loading, profile?.role, router, safeBack, trip]);
}
