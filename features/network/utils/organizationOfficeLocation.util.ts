import type { OrganizationLocation } from "@/features/organization/services/organization.service";

/** Display label for HQ card and contact rows. */
export function formatOrganizationOfficeAddress(
  location?: OrganizationLocation | null,
): string {
  if (!location) return "Registered business address on file";
  const parts = [location.address_line, location.locality, location.city, location.state, location.pincode]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(", ") : "Registered business address on file";
}

/** Query string for Mapbox / places geocoding (India). */
export function buildOrganizationOfficeGeocodeQuery(
  location?: OrganizationLocation | null,
): string | null {
  if (!location) return null;
  const parts = [location.address_line, location.locality, location.city, location.state, location.pincode]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (parts.length === 0) return null;
  return `${parts.join(", ")}, India`;
}
