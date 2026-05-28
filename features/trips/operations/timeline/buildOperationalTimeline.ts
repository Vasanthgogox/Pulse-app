import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripFuelEntry, TripTollEntry } from "../types";

export interface OperationalTimelineItem {
  key: string;
  title: string;
  subtitle: string;
  at: string;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildOperationalTimeline(params: {
  trip: TripRow;
  fuelEntries: TripFuelEntry[];
  tollEntries: TripTollEntry[];
}): OperationalTimelineItem[] {
  const { trip, fuelEntries, tollEntries } = params;
  const items: Array<{ atRaw: string; item: OperationalTimelineItem }> = [];
  if (trip.odometer_updated_at) {
    items.push({
      atRaw: trip.odometer_updated_at,
      item: {
        key: "odometer-updated",
        title: "Verification updated",
        subtitle: (trip.odometer_verification_state ?? "none").replaceAll("_", " "),
        at: fmtDateTime(trip.odometer_updated_at),
      },
    });
  }
  fuelEntries.forEach((entry) => {
    items.push({
      atRaw: entry.entered_at,
      item: {
        key: `fuel-${entry.id}`,
        title: "Fuel entry logged",
        subtitle: `₹${Math.round(entry.amount_inr).toLocaleString("en-IN")} • ${
          entry.station_name?.trim() || "Station"
        }`,
        at: fmtDateTime(entry.entered_at),
      },
    });
  });
  tollEntries.forEach((entry) => {
    items.push({
      atRaw: entry.entered_at,
      item: {
        key: `toll-${entry.id}`,
        title: "Toll entry logged",
        subtitle: `₹${Math.round(entry.amount_inr).toLocaleString("en-IN")} • ${
          entry.plaza_name?.trim() || "Plaza"
        }`,
        at: fmtDateTime(entry.entered_at),
      },
    });
  });
  return items
    .sort((a, b) => +new Date(b.atRaw) - +new Date(a.atRaw))
    .map((row) => row.item)
    .slice(0, 8);
}
