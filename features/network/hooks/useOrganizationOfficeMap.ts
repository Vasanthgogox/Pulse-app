import { getOrganizationLocationsByIds } from "@/features/organization/services/organization.service";
import { geocodeOrganizationOffice } from "@/features/network/utils/geocodeOrganizationOffice.util";
import { formatOrganizationOfficeAddress } from "@/features/network/utils/organizationOfficeLocation.util";
import { useQuery } from "@tanstack/react-query";

export type OfficeMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type OrganizationOfficeMapData = {
  addressLabel: string;
  coordinate: OfficeMapCoordinate | null;
  geocodedName: string | null;
};

export function useOrganizationOfficeMap(orgId: string | null) {
  return useQuery({
    queryKey: ["network", "office-map", orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<OrganizationOfficeMapData> => {
      const { error, locations } = await getOrganizationLocationsByIds(
        orgId ? [orgId] : [],
      );
      if (error) throw error;

      const location = locations[0] ?? null;
      const addressLabel = formatOrganizationOfficeAddress(location);
      const { coordinate, geocodedName } =
        await geocodeOrganizationOffice(location);

      return { addressLabel, coordinate, geocodedName };
    },
  });
}
