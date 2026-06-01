import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";

/** Party banner for GPay-style rate entry (matches Create Trip client price preview). */
export function supplierToNumericPartyPreview(
  supplier: SupplierRow,
): NumericEntryPartyPreview {
  return {
    name:
      supplier.company_name?.trim() ||
      supplier.name?.trim() ||
      supplier.contact_person?.trim() ||
      "Partner",
    subtitle: [supplier.supplier_type, supplier.phone, supplier.email]
      .filter(Boolean)
      .join(" · "),
    entityType: "supplier",
    avatarUrl: supplier.avatar_url ?? null,
    avatarSeed: supplier.avatar_seed ?? null,
    organizationImageUrl:
      (supplier as { organization_avatar_url?: string | null })
        .organization_avatar_url ?? null,
    organizationAvatarSeed:
      (supplier as { organization_avatar_seed?: string | null })
        .organization_avatar_seed ?? null,
  };
}
