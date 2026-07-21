/**
 * Fine-grained member surface access — org model ∩ permissions.surfaces.
 * Use for actions that share a Capability but must be toggled independently
 * (create-indent vs create-trip, finance sub-tabs, assign, etc.).
 */
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import {
  defaultSurfacesForRole,
  hydrateMemberSurfaces,
  memberHasSurface,
  type MemberSurfaceId,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";
import { useCapabilities, useOrgCapabilities } from "@/lib/useCapabilities";
import { useCallback, useMemo } from "react";

export type MemberAccessApi = {
  /** Member-filtered capabilities (same as useCapabilities). */
  capabilities: ReturnType<typeof useCapabilities>;
  /** Org-only capabilities (operating model). */
  orgCapabilities: ReturnType<typeof useOrgCapabilities>;
  surfaces: MemberSurfaceMap;
  bypass: boolean;
  isLoading: boolean;
  can: (id: MemberSurfaceId) => boolean;
};

export function useMemberAccess(): MemberAccessApi {
  const orgCapabilities = useOrgCapabilities();
  const capabilities = useCapabilities();
  const workspace = useOptionalActiveWorkspace();

  const bypass =
    !!workspace &&
    (workspace.memberRole === "owner" ||
      workspace.memberRole === "admin" ||
      workspace.memberPlatformRole === "admin");

  const surfaces = useMemo<MemberSurfaceMap>(() => {
    if (!workspace) return {};
    if (workspace.memberSurfaces && Object.keys(workspace.memberSurfaces).length > 0) {
      return hydrateMemberSurfaces(workspace.memberSurfaces, orgCapabilities);
    }
    if (workspace.memberPlatformRole) {
      return defaultSurfacesForRole(workspace.memberPlatformRole, orgCapabilities);
    }
    return {};
  }, [workspace, orgCapabilities]);

  const can = useCallback(
    (id: MemberSurfaceId) =>
      memberHasSurface(orgCapabilities, surfaces, id, bypass),
    [orgCapabilities, surfaces, bypass],
  );

  return {
    capabilities,
    orgCapabilities,
    surfaces,
    bypass,
    isLoading: workspace?.isLoading ?? false,
    can,
  };
}
