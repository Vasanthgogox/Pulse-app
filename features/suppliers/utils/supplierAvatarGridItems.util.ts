import type { AssignmentAvatarGridItem } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { resolveWizardContactPhone } from "@/features/clients/utils/clientContactDisplay.util";

export function supplierToAvatarGridItem(p: SupplierRow): AssignmentAvatarGridItem {
  const title = p.company_name || p.name || p.contact_person || "—";
  const phone = resolveWizardContactPhone(p.phone);
  return {
    id: p.id,
    title,
    subtitle: phone ?? undefined,
    avatarUrl: p.avatar_url ?? null,
    avatarSeed: p.avatar_seed ?? null,
    entityType: "supplier",
  };
}

export function suppliersToAvatarGridItems(
  suppliers: SupplierRow[],
): AssignmentAvatarGridItem[] {
  return suppliers.map(supplierToAvatarGridItem);
}
