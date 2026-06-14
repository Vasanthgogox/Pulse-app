import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { useDriverTripOpsActions } from "@/features/driver/hooks/useDriverTripOpsActions";
import {
  driverOpsTripCapabilities,
  resolveDriverOpsActiveTrip,
} from "@/features/driver/utils/driverActiveOpsTrip.util";
import * as tripsService from "@/features/trips/services/trips.service";
import { useDriverHomeDriversQuery } from "@/lib/queries/useDriverHomeDriversQuery";
import { usePendingOtpTripsQuery } from "@/lib/queries/usePendingOtpTripsQuery";
import { ROUTES } from "@/lib/routes";

const DRIVER_ACCEPTED_TRIP_ID_KEY = "driver_accepted_trip_id";

type DriverTripOpsContextValue = {
  hasTargetTrip: boolean;
  showExpenseOps: boolean;
  showOdometerOps: boolean;
  openExpense: () => void;
  openOdometer: () => void;
  registerContextTrip: (trip: tripsService.TripRow | null) => void;
};

const DriverTripOpsContext = createContext<DriverTripOpsContextValue | null>(null);

function useDriverOpsTripsQuery(userId: string | null, driverIdsKey: string, enabled: boolean) {
  const linked = useDriverHomeDriversQuery(userId);
  const driverIds = useMemo(
    () => linked.activeLinkedDrivers.map((d) => d.id),
    [linked.activeLinkedDrivers],
  );

  return useQuery({
    queryKey: ["driver-ops-trips", userId, driverIdsKey],
    queryFn: async () => {
      if (driverIds.length === 0) return [] as tripsService.TripRow[];
      const res = await tripsService.getTripsByDriverIds(driverIds);
      if (res.error) throw res.error;
      return res.trips ?? [];
    },
    enabled: enabled && !!userId && linked.isFetched && driverIds.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function DriverTripOpsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const linkedDriversQuery = useDriverHomeDriversQuery(uid);
  const pendingOtpQuery = usePendingOtpTripsQuery(uid);
  const tripsQuery = useDriverOpsTripsQuery(
    uid,
    linkedDriversQuery.driverIdsKey,
    !!uid,
  );

  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [contextTrip, setContextTrip] = useState<tripsService.TripRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY).then((id) => {
        if (!cancelled) setAcceptedTripId(id?.trim() ? id : null);
      });
      void tripsQuery.refetch();
      return () => {
        cancelled = true;
      };
    }, [tripsQuery.refetch]),
  );

  const allTrips = tripsQuery.data ?? [];
  const pendingTrips = pendingOtpQuery.pendingTrips;

  const activeTrip = useMemo(
    () => resolveDriverOpsActiveTrip({ trips: allTrips, pendingTrips, acceptedTripId }),
    [acceptedTripId, allTrips, pendingTrips],
  );

  const targetTrip = activeTrip ?? contextTrip;

  const baseOps = useDriverTripOpsActions({
    trips: allTrips,
    pendingTrips,
    acceptedTripId,
    activeTrip: targetTrip,
  });

  const caps = useMemo(() => driverOpsTripCapabilities(targetTrip), [targetTrip]);

  const registerContextTrip = useCallback((trip: tripsService.TripRow | null) => {
    setContextTrip(trip);
  }, []);

  const alertPickTrip = useCallback(() => {
    Alert.alert(
      "No trip selected",
      "Accept or start a trip on Dashboard, or open a trip from History to add expenses and odometer readings.",
      [
        {
          text: "Open History",
          onPress: () => router.push("/(driver)/trip-history" as never),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [router]);

  const openExpense = useCallback(() => {
    if (!targetTrip?.id) {
      alertPickTrip();
      return;
    }
    if (!caps.showExpense) {
      Alert.alert(
        "Expense not available",
        "This trip type does not support in-app expense logging.",
        [{ text: "OK" }],
      );
      return;
    }
    router.push(ROUTES.tripOtherExpenseEntry(targetTrip.id) as never);
  }, [alertPickTrip, caps.showExpense, router, targetTrip?.id]);

  const openOdometer = useCallback(() => {
    if (!targetTrip?.id) {
      alertPickTrip();
      return;
    }
    if (!caps.showOdometer) {
      Alert.alert(
        "Odometer not available",
        "Odometer readings apply to asset fleet trips only.",
        [{ text: "OK" }],
      );
      return;
    }
    baseOps.openOdometer();
  }, [alertPickTrip, baseOps, caps.showOdometer, targetTrip?.id]);

  const value = useMemo<DriverTripOpsContextValue>(
    () => ({
      hasTargetTrip: Boolean(targetTrip?.id),
      showExpenseOps: caps.showExpense,
      showOdometerOps: caps.showOdometer,
      openExpense,
      openOdometer,
      registerContextTrip,
    }),
    [
      caps.showExpense,
      caps.showOdometer,
      openExpense,
      openOdometer,
      registerContextTrip,
      targetTrip?.id,
    ],
  );

  return (
    <DriverTripOpsContext.Provider value={value}>
      {children}
    </DriverTripOpsContext.Provider>
  );
}

export function useDriverTripOps() {
  const ctx = useContext(DriverTripOpsContext);
  if (!ctx) {
    throw new Error("useDriverTripOps must be used within DriverTripOpsProvider");
  }
  return ctx;
}

/** Optional hook for screens outside provider (should not happen in driver app). */
export function useOptionalDriverTripOps() {
  return useContext(DriverTripOpsContext);
}

export function useRegisterDriverContextTrip(trip: tripsService.TripRow | null | undefined) {
  const ctx = useOptionalDriverTripOps();
  useFocusEffect(
    useCallback(() => {
      if (!ctx) return undefined;
      ctx.registerContextTrip(trip ?? null);
      return () => ctx.registerContextTrip(null);
    }, [ctx, trip]),
  );
}
