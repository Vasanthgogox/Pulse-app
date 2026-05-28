export type VehicleProfitabilityState =
  | "healthy"
  | "low_margin"
  | "negative"
  | "idle"
  | "high_maintenance";

export interface VehicleProfitabilityBreakdown {
  vehicleId: string;
  revenue: number;
  operationalCost: number;
  ownershipCost: number;
  maintenanceCost: number;
  allocatedCost: number;
  unallocatedCost: number;
  outstandingPayables: number;
  netProfitability: number;
  profitabilityState: VehicleProfitabilityState;
  allocationEfficiency: number;
}
