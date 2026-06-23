import type { OrganizationWorkspaceProfile } from "@/features/organization/services/organizationWorkspaceProfile.service";
import type { WorkspaceKyc } from "@/types/organization";

export type NetworkHubProfileCompletionInput = {
  profile?: OrganizationWorkspaceProfile | null;
  locationCount?: number;
  kyc?: WorkspaceKyc | null;
};

export type NetworkHubProfileGap = {
  key: string;
  label: string;
  section: "contact" | "highlights" | "about" | "products" | "kyc" | "locations";
};

const KYC_FIELDS = ["gstin", "business_pan", "cin"] as const;

function isKycComplete(kyc?: WorkspaceKyc | null): boolean {
  if (!kyc) return false;
  return KYC_FIELDS.every((field) => !!kyc[field]);
}

/** Matches Overview + Company profile fields (excludes always-on Status / Model). */
export function networkHubProfileCompletion(
  input: NetworkHubProfileCompletionInput,
): { pct: number; gaps: NetworkHubProfileGap[] } {
  const p = input.profile;
  const checks: Array<{ filled: boolean; gap: NetworkHubProfileGap }> = [
    {
      filled: !!(p?.address_line?.trim() || p?.city?.trim() || p?.state?.trim()),
      gap: { key: "address", label: "Address", section: "contact" },
    },
    {
      filled: !!p?.profile_website?.trim(),
      gap: { key: "website", label: "Website", section: "contact" },
    },
    {
      filled: p?.founded_year != null,
      gap: { key: "founded", label: "Founded", section: "highlights" },
    },
    {
      filled: !!(p?.profile_area?.trim() || p?.zone?.trim()),
      gap: { key: "area", label: "Area", section: "highlights" },
    },
    {
      filled: !!p?.profile_ceo_name?.trim(),
      gap: { key: "ceo", label: "CEO / Owner", section: "highlights" },
    },
    {
      filled: !!p?.profile_sector?.trim(),
      gap: { key: "sector", label: "Sector", section: "highlights" },
    },
    {
      filled: (input.locationCount ?? 0) > 0,
      gap: { key: "locations", label: "Locations", section: "locations" },
    },
    {
      filled: !!p?.profile_about?.trim(),
      gap: { key: "about", label: "About", section: "about" },
    },
    {
      filled: (p?.profile_products?.length ?? 0) > 0,
      gap: { key: "products", label: "Products", section: "products" },
    },
    {
      filled: isKycComplete(input.kyc),
      gap: { key: "kyc", label: "Compliance & KYC", section: "kyc" },
    },
  ];

  const filled = checks.filter((c) => c.filled).length;
  const pct = Math.round((filled / checks.length) * 100);
  const gaps = checks.filter((c) => !c.filled).map((c) => c.gap);
  return { pct, gaps };
}
