import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import {
  resolvePartyAvatarIdentityFromClient,
  resolvePartyAvatarIdentityFromSupplier,
  supplierDisplayName,
} from "@/lib/entityIdentity";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type LoadCenterIntegratedParty = {
  id: string;
  displayName: string;
  entityType: "client" | "supplier";
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  linkedOrganizationId: string;
};

function isIntegratedClient(client: ClientRow): boolean {
  const linkedOrgId = (client.linked_organization_id ?? "").trim();
  const integrated = client.is_integrated ?? Boolean(linkedOrgId);
  return integrated && Boolean(linkedOrgId);
}

function isIntegratedSupplier(supplier: SupplierRow): boolean {
  const linkedOrgId = (supplier.linked_organization_id ?? "").trim();
  const integrated =
    supplier.supplier_type === "integrated" ||
    Boolean(linkedOrgId);
  return integrated && Boolean(linkedOrgId);
}

export function selectIntegratedClientsForLoadCenter(
  clients: readonly ClientRow[],
  linkedOrgByOrganizationId: Record<string, LinkedOrgDisplay>,
): LoadCenterIntegratedParty[] {
  return clients
    .filter(isIntegratedClient)
    .map((client) => {
      const linkedOrgId = (client.linked_organization_id ?? "").trim();
      const identity = resolvePartyAvatarIdentityFromClient(
        client,
        linkedOrgByOrganizationId[linkedOrgId],
      );
      return {
        id: client.id,
        displayName: identity.displayName,
        entityType: "client" as const,
        organizationImageUrl: identity.organizationImageUrl,
        organizationAvatarSeed: identity.organizationAvatarSeed,
        avatarUrl: identity.avatarUrl,
        avatarSeed: identity.avatarSeed,
        linkedOrganizationId: linkedOrgId,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function selectIntegratedSuppliersForLoadCenter(
  suppliers: readonly SupplierRow[],
  linkedOrgByOrganizationId: Record<string, LinkedOrgDisplay>,
): LoadCenterIntegratedParty[] {
  return suppliers
    .filter(isIntegratedSupplier)
    .map((supplier) => {
      const linkedOrgId = (supplier.linked_organization_id ?? "").trim();
      const identity = resolvePartyAvatarIdentityFromSupplier(
        supplier,
        linkedOrgByOrganizationId[linkedOrgId],
      );
      return {
        id: supplier.id,
        displayName: supplierDisplayName(supplier),
        entityType: "supplier" as const,
        organizationImageUrl: identity.organizationImageUrl,
        organizationAvatarSeed: identity.organizationAvatarSeed,
        avatarUrl: identity.avatarUrl,
        avatarSeed: identity.avatarSeed,
        linkedOrganizationId: linkedOrgId,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
