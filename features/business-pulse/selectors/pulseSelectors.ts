import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import {
  selectFleetProfitabilitySummary,
  selectVehicleProfitabilityBreakdown,
} from "@/features/fleet";
import type {
  PulseComplianceState,
  PulseDataset,
  PulseFilterState,
  PulseHealthState,
  PulseSettlementState,
} from "../types";
import type { VehiclePnLRow } from "@/features/vehicles/pnl";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inDateRange(value: string | null | undefined, start: string | null, end: string | null): boolean {
  if (!value) return true;
  const day = value.slice(0, 10);
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

function isVoid(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "void" || normalized === "voided";
}

function toSettlementState(row: {
  posting_state?: string | null;
  reimbursement_state?: string | null;
  payment_owner?: string | null;
}): PulseSettlementState {
  const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
  const posting = String(row.posting_state ?? "").toLowerCase();
  const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
  if (paymentOwner !== "driver") return "healthy";
  if (posting !== "posted") return "attention";
  if (reimbursement === "reimbursed") return "healthy";
  if (!reimbursement) return "critical";
  return "attention";
}

function getDocumentExpiryStatuses(documents: unknown): PulseComplianceState[] {
  const list: PulseComplianceState[] = [];
  if (!documents || typeof documents !== "object") return ["missing"];
  const now = Date.now();
  for (const value of Object.values(documents as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const expiryDate = String((value as { expiryDate?: string }).expiryDate ?? "").trim();
    if (!expiryDate) {
      list.push("missing");
      continue;
    }
    const expiryTs = new Date(expiryDate).getTime();
    if (!Number.isFinite(expiryTs)) {
      list.push("missing");
      continue;
    }
    const daysLeft = Math.floor((expiryTs - now) / 86400000);
    if (daysLeft < 0) list.push("critical");
    else if (daysLeft <= 30) list.push("expiring_soon");
    else list.push("healthy");
  }
  return list.length > 0 ? list : ["missing"];
}

function collapseCompliance(states: PulseComplianceState[]): PulseComplianceState {
  if (states.includes("critical")) return "critical";
  if (states.includes("missing")) return "missing";
  if (states.includes("expiring_soon")) return "expiring_soon";
  return "healthy";
}

export function buildVehiclePnLRows(dataset: PulseDataset, tripIds: Set<string>): VehiclePnLRow[] {
  const byVehicle = new Map<string, VehiclePnLRow>();
  for (const vehicle of dataset.vehicles) {
    byVehicle.set(vehicle.id, {
      id: vehicle.id,
      name: vehicle.vehicle_number,
      type: vehicle.vehicle_type ?? "Vehicle",
      isUnassigned: false,
      trips: 0,
      sales: 0,
      expense: 0,
      operationalExpense: 0,
      ownershipExpense: 0,
      maintenanceExpense: 0,
      allocatedCost: 0,
      unallocatedCost: 0,
      outstandingPayables: 0,
      allocationEfficiency: 0,
      pnl: 0,
      margin: 0,
    });
  }

  for (const trip of dataset.trips) {
    if (!trip.vehicle_id || !tripIds.has(trip.id)) continue;
    const row = byVehicle.get(trip.vehicle_id);
    if (!row) continue;
    row.trips += 1;
    row.sales += Math.max(0, toNumber(trip.client_price));
  }

  for (const entry of dataset.vehicleLedger) {
    if (!entry.vehicle_id) continue;
    if (entry.trip_id && !tripIds.has(entry.trip_id)) continue;
    const row = byVehicle.get(entry.vehicle_id);
    if (!row) continue;
    const amount = Math.max(0, toNumber(entry.amount));
    if (amount <= 0) continue;
    const sourceType = String(entry.source_type ?? "").toLowerCase();
    const ownershipSources = new Set([
      "emi",
      "insurance",
      "permit",
      "fitness",
      "tax",
      "depreciation",
      "manual_adjustment",
      "gps",
      "tire",
      "oil",
    ]);
    const maintenanceSources = new Set(["maintenance", "repair", "service"]);
    row.expense += amount;
    if (ownershipSources.has(sourceType)) {
      row.ownershipExpense += amount;
      if (entry.trip_id) row.allocatedCost += amount;
      else row.unallocatedCost += amount;
    } else {
      row.operationalExpense += amount;
    }
    if (maintenanceSources.has(sourceType)) row.maintenanceExpense += amount;
  }

  const fuelByTrip = new Map<string, number>();
  for (const fuel of dataset.fuelRows) {
    if (!tripIds.has(fuel.trip_id) || isVoid(fuel.status)) continue;
    const settlement = toSettlementState(fuel);
    if (settlement === "healthy") continue;
    fuelByTrip.set(fuel.trip_id, (fuelByTrip.get(fuel.trip_id) ?? 0) + Math.max(0, toNumber(fuel.amount_inr)));
  }
  const tollByTrip = new Map<string, number>();
  for (const toll of dataset.tollRows) {
    if (!tripIds.has(toll.trip_id) || isVoid(toll.status)) continue;
    const settlement = toSettlementState(toll);
    if (settlement === "healthy") continue;
    tollByTrip.set(toll.trip_id, (tollByTrip.get(toll.trip_id) ?? 0) + Math.max(0, toNumber(toll.amount_inr)));
  }
  for (const trip of dataset.trips) {
    if (!trip.vehicle_id || !tripIds.has(trip.id)) continue;
    const row = byVehicle.get(trip.vehicle_id);
    if (!row) continue;
    row.outstandingPayables += (fuelByTrip.get(trip.id) ?? 0) + (tollByTrip.get(trip.id) ?? 0);
  }

  const rows = Array.from(byVehicle.values());
  for (const row of rows) {
    row.pnl = row.sales - row.expense - row.outstandingPayables;
    row.margin = row.sales > 0 ? (row.pnl / row.sales) * 100 : row.expense > 0 ? -100 : 0;
    const denominator = Math.max(1, row.ownershipExpense);
    row.allocationEfficiency = Number(((row.allocatedCost / denominator) * 100).toFixed(2));
  }
  return rows;
}

export function applyPulseFilters(dataset: PulseDataset, filters: PulseFilterState) {
  const start = filters.dateRange.start;
  const end = filters.dateRange.end;

  let tripFiltered = dataset.trips.filter((trip) => {
    if (!inDateRange(trip.pickup_date ?? trip.created_at ?? null, start, end)) return false;
    if (filters.clientIds.length > 0 && !filters.clientIds.includes(String(trip.client_id ?? ""))) return false;
    if (filters.supplierIds.length > 0 && !filters.supplierIds.includes(String(trip.supplier_id ?? ""))) return false;
    if (filters.vehicleIds.length > 0 && !filters.vehicleIds.includes(String(trip.vehicle_id ?? ""))) return false;
    if (filters.driverIds.length > 0 && !filters.driverIds.includes(String(trip.driver_id ?? ""))) return false;
    if (filters.branches.length > 0) {
      const branchCandidate = `${trip.pickup_area ?? ""} ${trip.drop_location ?? ""}`.toLowerCase();
      const match = filters.branches.some((branch) =>
        branchCandidate.includes(String(branch).toLowerCase()),
      );
      if (!match) return false;
    }
    if (filters.routes.length > 0) {
      const routeKey = `${trip.pickup_area} -> ${trip.drop_location}`.toLowerCase();
      const hasRoute = filters.routes.some((route) => routeKey.includes(route.toLowerCase()));
      if (!hasRoute) return false;
    }
    if (filters.executionModels.length > 0) {
      const mode = getTripExecutionModel(trip);
      if (!filters.executionModels.includes(mode)) return false;
    }
    return true;
  });

  const tripIds = new Set(tripFiltered.map((trip) => trip.id));
  const clientIds = new Set(tripFiltered.map((trip) => String(trip.client_id ?? "")).filter(Boolean));
  const supplierIds = new Set(tripFiltered.map((trip) => String(trip.supplier_id ?? "")).filter(Boolean));
  const vehicleIds = new Set(tripFiltered.map((trip) => String(trip.vehicle_id ?? "")).filter(Boolean));
  const driverIds = new Set(tripFiltered.map((trip) => String(trip.driver_id ?? "")).filter(Boolean));

  const clients = dataset.clients.filter((row) => clientIds.has(row.id));
  const suppliers = dataset.suppliers.filter((row) => supplierIds.has(row.id));
  const vehicles = dataset.vehicles.filter((row) => vehicleIds.has(row.id));
  const drivers = dataset.drivers.filter((row) => driverIds.has(row.id));

  const vehicleLedger = dataset.vehicleLedger.filter((row) => {
    if (row.trip_id && !tripIds.has(row.trip_id)) return false;
    if (filters.vehicleIds.length > 0 && !filters.vehicleIds.includes(String(row.vehicle_id ?? ""))) return false;
    return inDateRange(row.created_at ?? null, start, end);
  });
  const fuelRows = dataset.fuelRows.filter((row) => {
    if (!tripIds.has(row.trip_id) || isVoid(row.status)) return false;
    if (filters.settlementStates.length > 0) {
      const settlement = toSettlementState(row);
      if (!filters.settlementStates.includes(settlement)) return false;
    }
    return true;
  });
  const tollRows = dataset.tollRows.filter((row) => {
    if (!tripIds.has(row.trip_id) || isVoid(row.status)) return false;
    if (filters.settlementStates.length > 0) {
      const settlement = toSettlementState(row);
      if (!filters.settlementStates.includes(settlement)) return false;
    }
    return true;
  });
  const maintenanceRows = dataset.maintenanceRows.filter((row) => {
    if (!vehicleIds.has(row.vehicle_id)) return false;
    return inDateRange(row.created_at ?? null, start, end) && !isVoid(row.status);
  });

  let filtered = {
    trips: tripFiltered,
    clients,
    suppliers,
    vehicles,
    drivers,
    vehicleLedger,
    fuelRows,
    tollRows,
    maintenanceRows,
  };

  if (filters.vehicleTypes.length > 0) {
    const allowedVehicles = new Set(
      filtered.vehicles
        .filter((vehicle) =>
          filters.vehicleTypes.some((type) =>
            String(vehicle.vehicle_type ?? "").toLowerCase().includes(type.toLowerCase()),
          ),
        )
        .map((vehicle) => vehicle.id),
    );
    filtered = {
      ...filtered,
      vehicles: filtered.vehicles.filter((vehicle) => allowedVehicles.has(vehicle.id)),
      trips: filtered.trips.filter((trip) => allowedVehicles.has(String(trip.vehicle_id ?? ""))),
    };
  }

  if (filters.complianceStates.length > 0) {
    const allowedVehicleIds = new Set(
      filtered.vehicles
        .filter((vehicle) => {
          const state = collapseCompliance(getDocumentExpiryStatuses(vehicle.documents));
          return filters.complianceStates.includes(state);
        })
        .map((vehicle) => vehicle.id),
    );
    const allowedDriverIds = new Set(
      filtered.drivers
        .filter((driver) => {
          const state: PulseComplianceState = String(driver.license_number ?? "").trim()
            ? "healthy"
            : "missing";
          return filters.complianceStates.includes(state);
        })
        .map((driver) => driver.id),
    );
    filtered = {
      ...filtered,
      trips: filtered.trips.filter((trip) => {
        const vehicleOk =
          allowedVehicleIds.size === 0 || allowedVehicleIds.has(String(trip.vehicle_id ?? ""));
        const driverOk =
          allowedDriverIds.size === 0 || allowedDriverIds.has(String(trip.driver_id ?? ""));
        return vehicleOk || driverOk;
      }),
      vehicles: filtered.vehicles.filter((vehicle) => allowedVehicleIds.has(vehicle.id)),
      drivers: filtered.drivers.filter((driver) => allowedDriverIds.has(driver.id)),
      vehicleLedger: filtered.vehicleLedger.filter((entry) =>
        allowedVehicleIds.has(String(entry.vehicle_id ?? "")),
      ),
      maintenanceRows: filtered.maintenanceRows.filter((entry) =>
        allowedVehicleIds.has(String(entry.vehicle_id ?? "")),
      ),
    };
  }

  return filtered;
}

export function selectRevenueTrend(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const byMonth = new Map<string, { revenue: number; margin: number }>();
  for (const trip of scoped.trips) {
    const month = (trip.pickup_date ?? trip.created_at ?? "").slice(0, 7);
    if (!month) continue;
    const revenue = Math.max(0, toNumber(trip.client_price));
    const supplier = Math.max(0, toNumber(trip.supplier_rate));
    const current = byMonth.get(month) ?? { revenue: 0, margin: 0 };
    current.revenue += revenue;
    current.margin += revenue - supplier;
    byMonth.set(month, current);
  }
  return Array.from(byMonth.entries())
    .map(([month, value]) => ({
      month,
      revenue: Number(value.revenue.toFixed(2)),
      margin: Number(value.margin.toFixed(2)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function selectMarginTrend(dataset: PulseDataset, filters: PulseFilterState) {
  return selectRevenueTrend(dataset, filters).map((point) => ({
    month: point.month,
    marginPct: point.revenue > 0 ? Number(((point.margin / point.revenue) * 100).toFixed(2)) : 0,
  }));
}

export function selectCashExposure(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const payableFuel = scoped.fuelRows
    .filter((row) => toSettlementState(row) !== "healthy")
    .reduce((sum, row) => sum + Math.max(0, toNumber(row.amount_inr)), 0);
  const payableToll = scoped.tollRows
    .filter((row) => toSettlementState(row) !== "healthy")
    .reduce((sum, row) => sum + Math.max(0, toNumber(row.amount_inr)), 0);
  return {
    payableExposure: Number((payableFuel + payableToll).toFixed(2)),
    workingCapitalBlocked: Number((payableFuel + payableToll).toFixed(2)),
  };
}

export function selectClientProfitability(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const byClient = new Map<string, { revenue: number; margin: number; tripCount: number }>();
  for (const trip of scoped.trips) {
    const clientId = String(trip.client_id ?? "");
    if (!clientId) continue;
    const row = byClient.get(clientId) ?? { revenue: 0, margin: 0, tripCount: 0 };
    const revenue = Math.max(0, toNumber(trip.client_price));
    const supplier = Math.max(0, toNumber(trip.supplier_rate));
    row.revenue += revenue;
    row.margin += revenue - supplier;
    row.tripCount += 1;
    byClient.set(clientId, row);
  }
  return scoped.clients
    .map((client) => {
      const metric = byClient.get(client.id) ?? { revenue: 0, margin: 0, tripCount: 0 };
      return {
        id: client.id,
        name: client.name,
        revenue: Number(metric.revenue.toFixed(2)),
        margin: Number(metric.margin.toFixed(2)),
        marginPct: metric.revenue > 0 ? Number(((metric.margin / metric.revenue) * 100).toFixed(2)) : 0,
        tripCount: metric.tripCount,
      };
    })
    .sort((a, b) => b.margin - a.margin);
}

export function selectClientPaymentRisk(dataset: PulseDataset, filters: PulseFilterState) {
  const clientPerf = selectClientProfitability(dataset, filters);
  return clientPerf.map((client) => ({
    id: client.id,
    name: client.name,
    riskLevel:
      client.marginPct < 8 ? ("critical" as PulseHealthState) : client.marginPct < 15 ? ("warning" as PulseHealthState) : ("healthy" as PulseHealthState),
    reason:
      client.marginPct < 8
        ? "Low realized margin indicates weak payment behavior or high discounting"
        : client.marginPct < 15
          ? "Margin trend under target"
          : "Margin trend healthy",
  }));
}

export function selectClientOperationalVolume(dataset: PulseDataset, filters: PulseFilterState) {
  return selectClientProfitability(dataset, filters).map((client) => ({
    id: client.id,
    name: client.name,
    tripCount: client.tripCount,
    revenue: client.revenue,
  }));
}

export function selectSupplierProfitability(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const bySupplier = new Map<string, { spend: number; revenue: number; tripCount: number }>();
  for (const trip of scoped.trips) {
    const supplierId = String(trip.supplier_id ?? "");
    if (!supplierId) continue;
    const row = bySupplier.get(supplierId) ?? { spend: 0, revenue: 0, tripCount: 0 };
    row.spend += Math.max(0, toNumber(trip.supplier_rate));
    row.revenue += Math.max(0, toNumber(trip.client_price));
    row.tripCount += 1;
    bySupplier.set(supplierId, row);
  }
  return scoped.suppliers
    .map((supplier) => {
      const metric = bySupplier.get(supplier.id) ?? { spend: 0, revenue: 0, tripCount: 0 };
      return {
        id: supplier.id,
        name: supplier.company_name ?? supplier.name ?? "Supplier",
        supplierSpend: Number(metric.spend.toFixed(2)),
        revenueSupported: Number(metric.revenue.toFixed(2)),
        contributionMargin: Number((metric.revenue - metric.spend).toFixed(2)),
        tripCount: metric.tripCount,
      };
    })
    .sort((a, b) => b.contributionMargin - a.contributionMargin);
}

export function selectSupplierReliability(dataset: PulseDataset, filters: PulseFilterState) {
  return selectSupplierProfitability(dataset, filters).map((supplier) => {
    const perTripMargin = supplier.tripCount > 0 ? supplier.contributionMargin / supplier.tripCount : 0;
    return {
      id: supplier.id,
      name: supplier.name,
      reliabilityScore: Number(Math.max(0, Math.min(100, perTripMargin / 1000 * 100)).toFixed(2)),
      risk:
        perTripMargin < 500 ? ("critical" as PulseHealthState) : perTripMargin < 1500 ? ("warning" as PulseHealthState) : ("healthy" as PulseHealthState),
    };
  });
}

export function selectSupplierSettlementExposure(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const bySupplier = new Map<string, number>();
  for (const trip of scoped.trips) {
    const supplierId = String(trip.supplier_id ?? "");
    if (!supplierId) continue;
    bySupplier.set(supplierId, (bySupplier.get(supplierId) ?? 0) + Math.max(0, toNumber(trip.supplier_rate)));
  }
  return scoped.suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.company_name ?? supplier.name ?? "Supplier",
    settlementExposure: Number((bySupplier.get(supplier.id) ?? 0).toFixed(2)),
  }));
}

export function selectFleetProfitability(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const tripIds = new Set(scoped.trips.map((trip) => trip.id));
  const vehicleRows = buildVehiclePnLRows(scoped, tripIds);
  return vehicleRows
    .map((row) => selectVehicleProfitabilityBreakdown(row))
    .sort((a, b) => b.netProfitability - a.netProfitability);
}

export function selectVehicleIdleExposure(dataset: PulseDataset, filters: PulseFilterState) {
  return selectFleetProfitability(dataset, filters)
    .filter((vehicle) => vehicle.profitabilityState === "idle" || vehicle.unallocatedCost > 0)
    .map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      exposure: Number((vehicle.unallocatedCost + vehicle.ownershipCost).toFixed(2)),
      profitabilityState: vehicle.profitabilityState,
    }));
}

export function selectVehicleMaintenanceIntensity(dataset: PulseDataset, filters: PulseFilterState) {
  return selectFleetProfitability(dataset, filters).map((vehicle) => ({
    vehicleId: vehicle.vehicleId,
    maintenanceToRevenuePct:
      vehicle.revenue > 0 ? Number(((vehicle.maintenanceCost / vehicle.revenue) * 100).toFixed(2)) : 0,
    maintenanceToOperationalPct:
      vehicle.operationalCost > 0
        ? Number(((vehicle.maintenanceCost / vehicle.operationalCost) * 100).toFixed(2))
        : 0,
    state:
      vehicle.maintenanceCost > vehicle.operationalCost * 0.6 && vehicle.maintenanceCost > 0
        ? ("critical" as PulseHealthState)
        : ("healthy" as PulseHealthState),
  }));
}

export function selectDriverOperationalHealth(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const byDriver = new Map<string, { tripCount: number; revenue: number }>();
  for (const trip of scoped.trips) {
    const driverId = String(trip.driver_id ?? "");
    if (!driverId) continue;
    const row = byDriver.get(driverId) ?? { tripCount: 0, revenue: 0 };
    row.tripCount += 1;
    row.revenue += Math.max(0, toNumber(trip.client_price));
    byDriver.set(driverId, row);
  }
  return scoped.drivers.map((driver) => {
    const metric = byDriver.get(driver.id) ?? { tripCount: 0, revenue: 0 };
    return {
      driverId: driver.id,
      driverName: driver.name,
      tripCount: metric.tripCount,
      revenue: Number(metric.revenue.toFixed(2)),
      state:
        metric.tripCount === 0 ? ("warning" as PulseHealthState) : ("healthy" as PulseHealthState),
    };
  });
}

export function selectDriverComplianceExposure(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  return scoped.drivers.map((driver) => {
    const hasLicense = String(driver.license_number ?? "").trim().length > 0;
    return {
      driverId: driver.id,
      driverName: driver.name,
      hasLicense,
      state: hasLicense ? ("healthy" as PulseComplianceState) : ("missing" as PulseComplianceState),
      reason: hasLicense ? "License mapped" : "License number missing",
    };
  });
}

export function selectDriverSettlementRisk(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const tripToDriver = new Map<string, string>();
  for (const trip of scoped.trips) {
    const driverId = String(trip.driver_id ?? "");
    if (!driverId) continue;
    tripToDriver.set(trip.id, driverId);
  }
  const byDriver = new Map<string, number>();
  for (const row of [...scoped.fuelRows, ...scoped.tollRows]) {
    const driverId = tripToDriver.get(row.trip_id);
    if (!driverId) continue;
    if (toSettlementState(row) === "healthy") continue;
    byDriver.set(driverId, (byDriver.get(driverId) ?? 0) + Math.max(0, toNumber(row.amount_inr)));
  }
  return scoped.drivers.map((driver) => ({
    driverId: driver.id,
    driverName: driver.name,
    settlementExposure: Number((byDriver.get(driver.id) ?? 0).toFixed(2)),
  }));
}

export function selectComplianceExpiryRisk(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  return scoped.vehicles.map((vehicle) => {
    const states = getDocumentExpiryStatuses(vehicle.documents);
    return {
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.vehicle_number,
      state: collapseCompliance(states),
      riskCount: states.filter((state) => state === "critical" || state === "expiring_soon" || state === "missing").length,
    };
  });
}

export function selectDocumentVerificationExposure(dataset: PulseDataset, filters: PulseFilterState) {
  const vehicleRisk = selectComplianceExpiryRisk(dataset, filters);
  const driverRisk = selectDriverComplianceExposure(dataset, filters);
  return {
    vehiclesAtRisk: vehicleRisk.filter((item) => item.state !== "healthy").length,
    driversAtRisk: driverRisk.filter((item) => item.state !== "healthy").length,
    vehicleRisk,
    driverRisk,
  };
}

export function selectFleetComplianceHealth(dataset: PulseDataset, filters: PulseFilterState) {
  const exposure = selectDocumentVerificationExposure(dataset, filters);
  const state: PulseHealthState =
    exposure.vehiclesAtRisk + exposure.driversAtRisk > 10
      ? "critical"
      : exposure.vehiclesAtRisk + exposure.driversAtRisk > 0
        ? "warning"
        : "healthy";
  return {
    state,
    vehiclesAtRisk: exposure.vehiclesAtRisk,
    driversAtRisk: exposure.driversAtRisk,
  };
}

export function selectOperationalHealth(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const delayedTrips = scoped.trips.filter((trip) => {
    if (!trip.started_at || !trip.pickup_date) return false;
    return trip.started_at.slice(0, 10) > trip.pickup_date.slice(0, 10);
  }).length;
  const pendingApprovals = scoped.fuelRows.filter((row) => String(row.approval_state ?? "").toLowerCase() === "review_pending").length +
    scoped.tollRows.filter((row) => String(row.approval_state ?? "").toLowerCase() === "review_pending").length;
  return {
    delayedTrips,
    pendingApprovals,
    state:
      delayedTrips + pendingApprovals > 20
        ? ("critical" as PulseHealthState)
        : delayedTrips + pendingApprovals > 0
          ? ("warning" as PulseHealthState)
          : ("healthy" as PulseHealthState),
  };
}

export function selectBusinessTelemetry(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const tripIds = new Set(scoped.trips.map((trip) => trip.id));
  const vehicleRows = buildVehiclePnLRows(scoped, tripIds);
  const fleet = selectFleetProfitabilitySummary(vehicleRows);
  const compliance = selectFleetComplianceHealth(dataset, filters);
  const operations = selectOperationalHealth(dataset, filters);
  const cash = selectCashExposure(dataset, filters);
  const chips: string[] = [...fleet.telemetry];
  if (cash.payableExposure > 0) chips.push("Settlement Risk");
  if (compliance.state === "critical") chips.push("Compliance Critical");
  else if (compliance.state === "warning") chips.push("Compliance Watch");
  if (operations.state === "critical") chips.push("Operational Health Critical");
  else if (operations.state === "warning") chips.push("Operational Watch");
  return chips.length > 0 ? Array.from(new Set(chips)) : ["Margin Healthy"];
}

export function selectBusinessPulseOverview(dataset: PulseDataset, filters: PulseFilterState) {
  const scoped = applyPulseFilters(dataset, filters);
  const tripIds = new Set(scoped.trips.map((trip) => trip.id));
  const vehicleRows = buildVehiclePnLRows(scoped, tripIds);
  const fleet = selectFleetProfitabilitySummary(vehicleRows);
  const cash = selectCashExposure(dataset, filters);
  const compliance = selectFleetComplianceHealth(dataset, filters);
  const operations = selectOperationalHealth(dataset, filters);
  return {
    revenue: Number(fleet.totalRevenue.toFixed(2)),
    margin: Number((fleet.totalRevenue - fleet.totalOperationalCost - fleet.totalOwnershipCost).toFixed(2)),
    cashExposure: cash.payableExposure,
    outstandingPayables: fleet.totalOutstandingPayables,
    fleetUtilization:
      vehicleRows.length > 0
        ? Number(((vehicleRows.filter((row) => row.trips > 0).length / vehicleRows.length) * 100).toFixed(2))
        : 0,
    settlementExposure: cash.payableExposure,
    complianceRisk:
      compliance.state === "critical" ? "Critical" : compliance.state === "warning" ? "Watch" : "Healthy",
    operationalHealth:
      operations.state === "critical" ? "Critical" : operations.state === "warning" ? "Watch" : "Healthy",
  };
}
