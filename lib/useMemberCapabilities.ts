/**
 * Domain access for the signed-in member = org operating model ∩ functional role.
 * Owner/admin bypass functional gating (full access, same as useCapabilities()).
 * A member with no functional role assigned gets no domain access until the
 * owner assigns one — see docs/RBAC_OPERATING_MODEL.md.
 */
import { useActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { functionalRoleFromPlatformRole } from "@/features/organization/utils/teamInviteRoles.util";
import {
  canAccessClients,
  canAccessFinance,
  canAccessIndents,
  canAccessTrips,
} from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemo } from "react";

export interface MemberDomainAccess {
  finance: boolean;
  sales: boolean;
  tripops: boolean;
  /** True until the active workspace (role + functional role) has resolved. */
  isLoading: boolean;
}

export function useMemberCapabilities(): MemberDomainAccess {
  const capabilities = useCapabilities();
  const { memberRole, memberPlatformRole, isLoading } = useActiveWorkspace();

  return useMemo(() => {
    const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";

    const orgAllowsFinance = canAccessFinance(capabilities);
    const orgAllowsSales =
      capabilities.includes("marketplace_post") ||
      capabilities.includes("marketplace_bid") ||
      canAccessClients(capabilities);
    const orgAllowsTripOps =
      canAccessIndents(capabilities) || canAccessTrips(capabilities);

    if (isOwnerOrAdmin) {
      return {
        finance: orgAllowsFinance,
        sales: orgAllowsSales,
        tripops: orgAllowsTripOps,
        isLoading,
      };
    }

    const functionalRole = functionalRoleFromPlatformRole(memberPlatformRole);
    return {
      finance: orgAllowsFinance && functionalRole === "finance",
      sales: orgAllowsSales && functionalRole === "sales",
      tripops: orgAllowsTripOps && functionalRole === "tripops",
      isLoading,
    };
  }, [capabilities, memberRole, memberPlatformRole, isLoading]);
}
