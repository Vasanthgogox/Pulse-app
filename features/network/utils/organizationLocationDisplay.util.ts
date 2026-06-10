import type { OrganizationLocationType } from '@/features/organization/services/organizationLocations.service';
import { formatOrganizationOfficeAddress } from '@/features/network/utils/organizationOfficeLocation.util';
import type { OrganizationLocation } from '@/features/organization/services/organization.service';

export const LOCATION_TYPE_GRADIENTS: Record<
  OrganizationLocationType,
  { bg: string; accent: string; label: string }
> = {
  registered_office: { bg: '#EEF2FF', accent: '#4F46E5', label: 'Registered office' },
  branch_office:    { bg: '#FFF8DD', accent: '#F6C000', label: 'Branch office' },
  primary_hub:      { bg: '#E8FFF3', accent: '#50CD89', label: 'Primary hub' },
  regional_office:  { bg: '#F8F5FF', accent: '#7239EA', label: 'Regional office' },
  dispatch_center:  { bg: '#F1FAFF', accent: '#009EF7', label: 'Dispatch center' },
  warehouse:        { bg: '#FFF1F2', accent: '#F1416C', label: 'Warehouse' },
  other:            { bg: '#F1F1F4', accent: '#78829D', label: 'Location' },
};

export type LocationCardModel = {
  id: string;
  name: string;
  locationType: OrganizationLocationType;
  department: string;
  addressLine: string;
  city: string | null;
  state: string | null;
  verified: boolean;
  persisted: boolean;
};

export function buildRegionLabel(city?: string | null, state?: string | null): string {
  const parts = [city?.trim(), state?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'India';
}

export function formatLocationSubtitle(
  hubIndex: number,
  department: string,
  city?: string | null,
  state?: string | null,
  verified?: boolean,
  locationType?: OrganizationLocationType,
): { line1: string; line2: string } {
  const typeLabel = locationType ? LOCATION_TYPE_GRADIENTS[locationType]?.label ?? 'Location' : `Hub ${hubIndex}`;
  return {
    line1: `${typeLabel} · ${department || 'Operations & dispatch'}`,
    line2: `${buildRegionLabel(city, state)} · ${verified ? 'Verified' : 'Unverified'}`,
  };
}

/** Fallback HQ card from org registered address when no saved locations exist. */
export function buildHeadquarterLocationCard(
  orgName: string,
  orgLocation?: OrganizationLocation | null,
): LocationCardModel {
  const address = formatOrganizationOfficeAddress(orgLocation);
  const hasAddress = address !== 'Registered business address on file';
  return {
    id: '__hq__',
    name: `${orgName.trim()} Registered office`,
    locationType: 'registered_office',
    department: 'Operations & dispatch',
    addressLine: orgLocation?.address_line?.trim() || (hasAddress ? address : ''),
    city: orgLocation?.city ?? null,
    state: orgLocation?.state ?? null,
    verified: hasAddress,
    persisted: false,
  };
}
