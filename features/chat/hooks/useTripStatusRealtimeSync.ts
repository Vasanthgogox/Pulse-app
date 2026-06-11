/**
 * Phase 3: patch legacy chat hub trip cards from `trips` row UPDATEs.
 *
 * Status / driver / vehicle fields no longer depend on org-wide
 * `trip_messages` INSERT for `status_change` / `system` broadcasts.
 */
import { useEffect } from "react";

import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";

import { useChatStore, type TripEntry } from "../store/useChatStore";

function patchTripFromRow(row: Record<string, unknown>): void {
  const tripId = typeof row.id === "string" ? row.id : null;
  if (!tripId) return;
  const store = useChatStore.getState();
  if (!store.trips[tripId]) return;

  const patch: Partial<TripEntry> = {};
  if (typeof row.status === "string") patch.status = row.status;
  if (typeof row.driver_display_name === "string") {
    patch.driverDisplayName = row.driver_display_name;
  }
  if (typeof row.vehicle_display_number === "string") {
    patch.vehicleDisplayNumber = row.vehicle_display_number;
  }
  if (typeof row.driver_id === "string") patch.driverId = row.driver_id;
  if (typeof row.supplier_id === "string") patch.supplierId = row.supplier_id;
  if (typeof row.pickup_area === "string") patch.pickupArea = row.pickup_area;
  if (typeof row.drop_location === "string") {
    patch.dropLocation = row.drop_location;
  }

  if (Object.keys(patch).length > 0) {
    store.applySystemUpdate(tripId, patch);
  }
}

export function useTripStatusRealtimeSync(
  organizationId: string | null,
  linkedOrgIds: string[],
) {
  useEffect(() => {
    const orgIds = [
      ...(organizationId ? [organizationId] : []),
      ...linkedOrgIds,
    ];
    if (orgIds.length === 0) return;

    const unsubs = orgIds.map((orgId) =>
      subscribeSharedPostgresChanges(
        `trips:chat_hub:${orgId}`,
        [
          {
            event: "UPDATE",
            schema: "public",
            table: "trips",
            filter: `organization_id=eq.${orgId}`,
          },
        ],
        (payload) => {
          if (payload.eventType !== "UPDATE" || !payload.new) return;
          patchTripFromRow(payload.new as Record<string, unknown>);
        },
      ),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [organizationId, linkedOrgIds]);
}
