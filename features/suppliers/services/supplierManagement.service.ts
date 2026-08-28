import { supabase } from "@/lib/supabase";
import {
  getSupplierById,
  getSupplierDetails,
  mergeSupplierDisplayFields,
} from "@/features/suppliers/services/suppliers.service";
import { getTripsForOrg } from "@/features/trips/services/trips.service";
import { getTransactionsByOrganization } from "@/features/finance/services/finance.service";
import { getDriversByOrganization } from "@/features/drivers/services/drivers.service";
import { getSalaryRequestsByOrganization } from "@/features/drivers/services/salaryRequests.service";
import {
  buildSupplierPerformanceFromTrips,
  type SupplierManagementBundle,
  type SupplierDriverSalaryRequest,
  type SupplierKycDocument,
  type ComplianceDocument,
  type SupplierContract,
  type SupplierVehicle,
  type SupplierWarehouse,
  type SupplierContactRow,
  type TimelineEvent,
} from "@/features/suppliers/types/supplierManagement.types";

export async function getSupplierManagementBundle(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; bundle: SupplierManagementBundle | null }> {
  const [supplierRes, detailsRes, tripsRes, txRes, rpcRes] = await Promise.all([
    getSupplierById(orgId, supplierId),
    getSupplierDetails(supplierId),
    getTripsForOrg(orgId),
    getTransactionsByOrganization(orgId),
    supabase().rpc("get_supplier_management_bundle", {
      p_org_id: orgId,
      p_supplier_id: supplierId,
    }),
  ]);

  if (supplierRes.error || !supplierRes.supplier) {
    return { error: supplierRes.error ?? new Error("Supplier not found"), bundle: null };
  }

  const supplier =
    !detailsRes.error && detailsRes.supplier
      ? mergeSupplierDisplayFields(supplierRes.supplier, detailsRes.supplier)
      : supplierRes.supplier;
  const supplierTrips = (tripsRes.trips ?? []).filter((t) => t.supplier_id === supplierId);
  const rpcData = (rpcRes.data ?? {}) as Record<string, unknown>;

  // Drivers and salary requests belong to the supplier's OWN organization
  // (when they're a linked Pulse org), not the aggregator's — the caller
  // (orgId) is only the aggregator looking in from the outside.
  const linkedOrgId = supplier.linked_organization_id ?? null;
  const [driversRes, salaryRes] = linkedOrgId
    ? await Promise.all([
        getDriversByOrganization(linkedOrgId),
        getSalaryRequestsByOrganization(linkedOrgId, { status: "pending" }),
      ])
    : [{ error: null, drivers: [] }, { error: null, requests: [] }];

  const driverNameById = new Map(
    (driversRes.drivers ?? []).map((d) => [d.id, d.name ?? d.phone ?? null]),
  );
  const driverSalaryRequests: SupplierDriverSalaryRequest[] = (salaryRes.requests ?? []).map(
    (r) => ({
      id: r.id,
      driver_id: r.driver_id,
      driver_name: driverNameById.get(r.driver_id) ?? null,
      request_type: r.request_type,
      amount: Number(r.amount),
      status: r.status,
      note: r.note ?? null,
      created_at: r.created_at,
    }),
  );

  const contacts = (rpcData.contacts ?? []) as SupplierContactRow[];
  const kyc_documents = (rpcData.kyc_documents ?? []) as SupplierKycDocument[];
  const compliance_docs = (rpcData.compliance_docs ?? []) as ComplianceDocument[];
  const contracts = (rpcData.contracts ?? []) as SupplierContract[];
  const fleet = (rpcData.fleet ?? []) as SupplierVehicle[];
  const warehouses = (rpcData.warehouses ?? []) as SupplierWarehouse[];

  const timeline: TimelineEvent[] = [
    {
      id: "created",
      event_type: "supplier_created",
      description: `Supplier ${supplier.name ?? "record"} created`,
      actor: null,
      meta: null,
      created_at: supplier.created_at,
    },
  ];

  return {
    error: null,
    bundle: {
      supplier,
      trips: supplierTrips,
      transactions: txRes.transactions ?? [],
      drivers: driversRes.drivers ?? [],
      driverSalaryRequests,
      contacts,
      kyc_documents,
      compliance_docs,
      contracts,
      fleet,
      warehouses,
      performance: buildSupplierPerformanceFromTrips(supplierTrips),
      crm_status: "standard",
      crm_notes: [],
      timeline,
    },
  };
}
