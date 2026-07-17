/**
 * Effective capabilities for the signed-in user.
 * Prefers current org `operatingModel` over stale profiles.aggregated/asset.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import {
  getCapabilitiesFromProfile,
  type Capability,
} from "@/lib/capabilities";
import { useMemo } from "react";

export function useCapabilities(): Capability[] {
  const { profile } = useAuth();
  const organization = useOptionalOrganization();
  const operatingModel = organization?.currentOrganization?.operatingModel;

  return useMemo(
    () =>
      getCapabilitiesFromProfile(
        profile
          ? {
              role: profile.role,
              aggregated: profile.aggregated,
              asset: profile.asset,
            }
          : null,
        operatingModel,
      ),
    [profile, operatingModel],
  );
}
