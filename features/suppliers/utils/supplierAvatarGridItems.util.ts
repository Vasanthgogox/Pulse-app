import type { AssignmentAvatarGridItem } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";

export function supplierToAvatarGridItem(p: SupplierRow): AssignmentAvatarGridItem {
  const title = p.company_name || p.name || p.contact_person || "—";
  const subtitle = [p.supplier_type, p.phone, p.email].filter(Boolean).join(" · ");
  return {
    id: p.id,
    title,
    subtitle: subtitle || undefined,
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
