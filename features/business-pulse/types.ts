import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";

export type PulseHealthState = "healthy" | "warning" | "critical";

export type PulseProfitabilityState =
  | "healthy"
  | "low_margin"
  | "negative"
  | "idle"
  | "high_maintenance";

export type PulseComplianceState = "healthy" | "expiring_soon" | "critical" | "missing";

export type PulseSettlementState = "healthy" | "attention" | "critical";

export interface PulseDateRange {
  start: string | null;
  end: string | null;
}

export interface PulseFilterState {
  dateRange: PulseDateRange;
  clientIds: string[];
  supplierIds: string[];
  vehicleIds: string[];
  driverIds: string[];
  branches: string[];
  routes: string[];
  tripModes: string[];
  executionModels: Array<"asset" | "aggregate">;
  vehicleTypes: string[];
  profitabilityStates: PulseProfitabilityState[];
  complianceStates: PulseComplianceState[];
  settlementStates: PulseSettlementState[];
}

export interface PulseFilterScope {
  dimensions: Array<keyof PulseFilterState>;
}

export interface PulseWidget {
  id: string;
  title: string;
  dataSource: string;
  filterScope: PulseFilterScope;
  refreshStrategy: "lazy" | "realtime" | "manual";
  riskLevel?: PulseHealthState;
}

export interface PulseVehicleLedgerRow {
  id: string;
  trip_id: string | null;
  vehicle_id: string | null;
  source_type: string | null;
  amount: number | null;
  created_at: string | null;
}

export interface PulseFuelRow {
  id: string;
  trip_id: string;
  amount_inr: number | null;
  approval_state: string | null;
  reimbursement_state: string | null;
  payment_owner: string | null;
  posting_state: string | null;
  status: string | null;
}

export interface PulseTollRow {
  id: string;
  trip_id: string;
  amount_inr: number | null;
  approval_state: string | null;
  reimbursement_state: string | null;
  payment_owner: string | null;
  posting_state: string | null;
  status: string | null;
}

export interface PulseMaintenanceRow {
  id: string;
  vehicle_id: string;
  amount_inr: number | null;
  status: string | null;
  created_at: string | null;
}

export interface PulseDataset {
  trips: TripRow[];
  clients: ClientRow[];
  suppliers: SupplierRow[];
  vehicles: VehicleRow[];
  drivers: DriverRow[];
  vehicleLedger: PulseVehicleLedgerRow[];
  fuelRows: PulseFuelRow[];
  tollRows: PulseTollRow[];
  maintenanceRows: PulseMaintenanceRow[];
}
