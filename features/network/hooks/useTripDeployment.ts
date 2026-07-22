/**
 * useTripDeployment — encapsulates the "final assignment" flow for Claimed loads
 * (supplier accepts awarded quote → trip is created, indent marked completed).
 */

import { acceptAwardedQuote } from "@/features/indents/services/accept-awarded-quote.service";
import {
  createMoverAssetTrip,
  createTripFromAssignedIndent,
} from "@/features/indents/services/indentConversionService";
import { getAcceptedDirectQuoteForIndent } from "@/features/indents/services/direct-quotes.service";
import { updateIndent, type DirectQuoteRow, type IndentRow } from "@/features/indents";
import { resolveIndentDeployQuoteWithFreshQuote } from "@/features/indents/utils/resolveIndentDeployQuote.util";
import { useInvalidateIndents, useInvalidateTrips } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateOperationalIdentity } from "@/lib/queries/operationalInvalidation";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

interface UseTripDeploymentParams {
  orgId: string | null;
  myQuoteByIndentId: Map<string, DirectQuoteRow>;
  onSuccess: (msg: string) => void;
}

export function useTripDeployment({
  orgId,
  myQuoteByIndentId,
  onSuccess,
}: UseTripDeploymentParams) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidateTrips = useInvalidateTrips();
  const invalidateIndents = useInvalidateIndents();
  const [assigningTripId, setAssigningTripId] = useState<string | null>(null);

  const finalize = async (load: IndentRow) => {
    if (assigningTripId === load.id) return;
    if (!orgId) {
      Alert.alert(
        "Cannot start trip",
        "Your organization context is missing. Please try again.",
      );
      return;
    }

    const myQuotes = Array.from(myQuoteByIndentId.values());
    const { quote: freshQuote } = await getAcceptedDirectQuoteForIndent(
      orgId,
      load.id,
    );
    const resolution = resolveIndentDeployQuoteWithFreshQuote(
      load,
      orgId,
      myQuotes,
      freshQuote,
    );

    if (!resolution) {
      Alert.alert(
        "Cannot start trip",
        "No accepted quote found for this load. Please ensure the load is awarded to you.",
      );
      return;
    }

    try {
      setAssigningTripId(load.id);
      const { error, trip } =
        resolution.mode === "direct_quote"
          ? await acceptAwardedQuote(resolution.quote.id)
          : await createTripFromAssignedIndent(load.id);
      if (error || !trip) {
        Alert.alert(
          "Could not create trip",
          error?.message ??
            "Unknown error while creating trip from awarded quote.",
        );
        return;
      }

      // Mark indent completed so it leaves Claimed list. Ignore status-update failure; trip is source of truth.
      await updateIndent(load.id, { status: "completed" });

      // Mover path: the deploying org is NOT the load owner (aggregator). The
      // trip just created is the aggregator's 'market' row on which the mover
      // is a payable. Give the mover its own 'asset' trip (own driver+vehicle)
      // so it can log fuel/toll/salary. Best-effort: failure must not block the
      // primary deploy — the aggregator trip is the source of truth.
      const isMover = load.organization_id !== orgId;
      if (isMover && trip.driver_id && trip.vehicle_id) {
        const { error: moverErr } = await createMoverAssetTrip(load.id, {
          driverId: trip.driver_id,
          vehicleId: trip.vehicle_id,
          vehicleDisplayNumber: trip.vehicle_display_number,
        });
        if (moverErr) {
          console.warn(
            "[useTripDeployment] mover asset trip not created",
            moverErr.message,
          );
        }
      }

      onSuccess("Trip Initialized");
      if (orgId) {
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        invalidateOperationalIdentity({
          queryClient,
          organizationId: orgId,
          tripId: trip.id,
        });
      }
      const isShipper = load.organization_id === orgId;
      if (isShipper) router.push("/(tabs)/trips" as import("expo-router").Href);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unknown error while creating trip.";
      Alert.alert("Could not create trip", msg);
    } finally {
      setAssigningTripId(null);
    }
  };

  return { finalize, assigningTripId };
}
