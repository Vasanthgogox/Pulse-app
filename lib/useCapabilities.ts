/**
 * Effective capabilities for the signed-in user.
 * - `useOrgCapabilities()` — operating-model only (no per-member filter)
 * - `useCapabilities()` — org ∩ member surfaces (non-owner/admin)
 */
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import {
  getCapabilitiesFromProfile,
  type Capability,
} from "@/lib/capabilities";
import {
  capabilitiesFromMemberSurfaces,
  defaultSurfacesForRole,
  hydrateMemberSurfaces,
} from "@/lib/memberSurfaces";
import { useMemo } from "react";

/** Org operating-model capabilities only (ignore per-member surface grants). */
export function useOrgCapabilities(): Capability[] {
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

/**
 * Capabilities for UI / helpers. Owner/admin → full org set.
 * Other members → org ∩ capabilities implied by enabled surfaces.
 */
export function useCapabilities(): Capability[] {
  const orgCaps = useOrgCapabilities();
  const workspace = useOptionalActiveWorkspace();

  return useMemo(() => {
    if (!workspace || workspace.isLoading) return orgCaps;

    const { memberRole, memberPlatformRole, memberSurfaces } = workspace;
    const bypass =
      memberRole === "owner" ||
      memberRole === "admin" ||
      memberPlatformRole === "admin";

    if (bypass) return orgCaps;

    const surfaces =
      memberSurfaces && Object.keys(memberSurfaces).length > 0
        ? hydrateMemberSurfaces(memberSurfaces, orgCaps)
        : memberPlatformRole
          ? defaultSurfacesForRole(memberPlatformRole, orgCaps)
          : {};

    return capabilitiesFromMemberSurfaces(orgCaps, surfaces, false);
  }, [orgCaps, workspace]);
}
