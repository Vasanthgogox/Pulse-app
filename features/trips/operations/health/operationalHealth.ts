import type { TripRow } from "@/features/trips/services/trips.service";

export interface OperationalHealthSnapshot {
  state: "healthy" | "attention" | "at_risk";
  message: string;
}

export function deriveOperationalHealth(trip: TripRow): OperationalHealthSnapshot {
  const discrepancy = Number(trip.distance_discrepancy_km ?? 0);
  const verification = String(trip.odometer_verification_state ?? "none");
  if (discrepancy >= 30) {
    return {
      state: "at_risk",
      message: "Distance mismatch is high; verify odometer and route notes.",
    };
  }
  if (verification === "none" || discrepancy >= 10) {
    return {
      state: "attention",
      message: "Operational logs are partially complete.",
    };
  }
  return { state: "healthy", message: "Trip operations look consistent." };
}
