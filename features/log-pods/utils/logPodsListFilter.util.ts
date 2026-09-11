export type LogIncomingPodsListTab =
  | "pending"
  | "completed"
  | "not_completed"
  | "all";

export type LogPodsPartyKind = "supplier" | "driver";

export type LogPodsPartyOption = {
  id: string;
  name: string;
};

export type LogPodsSupplierOption = LogPodsPartyOption;

export function supplierOperatedLogPodTrips<
  T extends { supplier_id: string; supplier_name: string },
>(trips: T[], supplier: LogPodsPartyOption | null): T[] {
  if (!supplier) return [];
  const name = supplier.name.trim().toLowerCase();
  return trips.filter((trip) => {
    if (supplier.id && trip.supplier_id && trip.supplier_id === supplier.id) {
      return true;
    }
    return Boolean(name) && trip.supplier_name.trim().toLowerCase() === name;
  });
}

export function driverOperatedLogPodTrips<
  T extends { driver_id: string; driver_name: string },
>(trips: T[], driver: LogPodsPartyOption | null): T[] {
  if (!driver) return [];
  const name = driver.name.trim().toLowerCase();
  return trips.filter((trip) => {
    if (driver.id && trip.driver_id && trip.driver_id === driver.id) {
      return true;
    }
    return Boolean(name) && trip.driver_name.trim().toLowerCase() === name;
  });
}

function tripStatusIsCompleted(status?: string | null): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return s === "completed" || s === "delivered" || s === "done";
}

export function filterLogPodTripsForTab<
  T extends { hardCopyReceived: boolean; status?: string | null },
>(trips: T[], tab: LogIncomingPodsListTab): T[] {
  if (tab === "all") return trips;
  if (tab === "pending") return trips.filter((trip) => !trip.hardCopyReceived);
  if (tab === "completed") {
    return trips.filter((trip) => tripStatusIsCompleted(trip.status));
  }
  return trips.filter((trip) => !tripStatusIsCompleted(trip.status));
}
