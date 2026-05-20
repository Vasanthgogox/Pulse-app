/**
 * useTripDeployment — encapsulates the "final assignment" flow for Claimed loads
 * (supplier accepts awarded quote → trip is created, indent marked completed).
 */

import { acceptAwardedQuote } from "@/features/indents/services/accept-awarded-quote.service";
import { updateIndent, type DirectQuoteRow, type IndentRow } from "@/features/indents";
import { useInvalidateIndents, useInvalidateTrips } from "@/lib/queries";
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

    const acceptedQuote = Array.from(myQuoteByIndentId.values()).find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );

    if (!acceptedQuote) {
      Alert.alert(
        "Cannot start trip",
        "No accepted quote found for this load. Please ensure the load is awarded to you.",
      );
      return;
    }

    try {
      setAssigningTripId(load.id);
      const { error, trip } = await acceptAwardedQuote(acceptedQuote.id);
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

      onSuccess("Trip Initialized");
      if (orgId) {
        invalidateTrips(orgId);
        invalidateIndents(orgId);
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
