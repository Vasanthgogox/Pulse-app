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
import { ROUTES } from "@/lib/routes";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemo } from "react";

export interface MemberDomainAccess {
  finance: boolean;
  sales: boolean;
  tripops: boolean;
  /** True until the active workspace (role + functional role) has resolved. */
  isLoading: boolean;
}

/**
 * The member's primary landing tab — the first domain their functional role can
 * reach. Drives both boot landing and the redirect target when a denied tab
 * bounces them. Returns `null` when the member can reach no domain at all
 * (no functional role assigned) — callers show a no-access notice instead of
 * looping a redirect. Owner/admin resolve to Trips (all domains allowed).
 */
export function memberHomeRouteFromAccess(
  access: MemberDomainAccess,
): string | null {
  if (access.tripops) return ROUTES.TABS.TRIPS;
  if (access.finance) return ROUTES.TABS.FINANCE;
  if (access.sales) return ROUTES.TABS.NETWORK;
  return null;
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
