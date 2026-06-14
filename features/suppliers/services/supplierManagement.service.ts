import { supabase } from "@/lib/supabase";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import { getTripsForOrg } from "@/features/trips/services/trips.service";
import { getTransactionsByOrganization } from "@/features/finance/services/finance.service";
import { getDriversByOrganization } from "@/features/drivers/services/drivers.service";
import {
  buildSupplierPerformanceFromTrips,
  type SupplierManagementBundle,
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
  const [supplierRes, tripsRes, txRes, driversRes, rpcRes] = await Promise.all([
    getSupplierById(orgId, supplierId),
    getTripsForOrg(orgId),
    getTransactionsByOrganization(orgId),
    getDriversByOrganization(orgId),
    supabase().rpc("get_supplier_management_bundle", {
      p_org_id: orgId,
      p_supplier_id: supplierId,
    }),
  ]);

  if (supplierRes.error || !supplierRes.supplier) {
    return { error: supplierRes.error ?? new Error("Supplier not found"), bundle: null };
  }

  const supplier = supplierRes.supplier;
  const supplierTrips = (tripsRes.trips ?? []).filter((t) => t.supplier_id === supplierId);
  const rpcData = (rpcRes.data ?? {}) as Record<string, unknown>;

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
