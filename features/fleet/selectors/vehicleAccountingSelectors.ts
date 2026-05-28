import type { VehicleExpenseEvent } from "@/features/fleet/domain/VehicleExpenseEvent";

function roundCurrency(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

const isPosted = (event: VehicleExpenseEvent): boolean =>
  event.approvalState === "approved" && event.postingState === "posted";

export function selectVehicleOperationalCost(events: VehicleExpenseEvent[]): number {
  return roundCurrency(
    events
      .filter((event) => event.expenseScope === "trip_specific" && isPosted(event))
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount) || 0), 0),
  );
}

export function selectVehicleOwnershipCost(events: VehicleExpenseEvent[]): number {
  return roundCurrency(
    events
      .filter((event) => event.expenseScope === "common" && isPosted(event))
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount) || 0), 0),
  );
}

export function selectVehicleMonthlyExpense(
  events: VehicleExpenseEvent[],
  month: number,
  year: number,
): number {
  return roundCurrency(
    events
      .filter((event) => {
        const date = new Date(event.createdAt);
        return date.getFullYear() === year && date.getMonth() + 1 === month;
      })
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount) || 0), 0),
  );
}

export function selectVehicleTripLinkedExpense(events: VehicleExpenseEvent[]): number {
  return roundCurrency(
    events
      .filter((event) => !!event.linkedTripId && isPosted(event))
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount) || 0), 0),
  );
}

export function selectVehicleMaintenanceCost(events: VehicleExpenseEvent[]): number {
  return roundCurrency(
    events
      .filter(
        (event) =>
          (event.category === "maintenance" || event.category === "service") &&
          isPosted(event),
      )
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount) || 0), 0),
  );
}

export function selectVehicleCostPerKm(input: {
  events: VehicleExpenseEvent[];
  distanceKm: number | null | undefined;
}): number | null {
  const distance = Math.max(0, Number(input.distanceKm ?? 0) || 0);
  if (!distance) return null;
  return roundCurrency(
    (selectVehicleOperationalCost(input.events) + selectVehicleOwnershipCost(input.events)) /
      distance,
  );
}

export function selectVehicleNetProfitability(input: {
  events: VehicleExpenseEvent[];
  tripRevenueInr: number;
}): number {
  return roundCurrency(
    Math.max(0, Number(input.tripRevenueInr ?? 0) || 0) -
      (selectVehicleOperationalCost(input.events) + selectVehicleOwnershipCost(input.events)),
  );
}
