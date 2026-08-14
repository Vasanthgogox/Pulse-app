/**
 * Domain access for the signed-in member = org operating model ∩ member domains.
 *
 * Member domains come from `organization_members.permissions.domains` when set
 * (multi-domain toggles on the permission detail page). Legacy rows without
 * `domains` fall back to the single functional role derived from platformRole.
 *
 * Owner/admin bypass functional gating (full access, same as useCapabilities()).
 * A member with no domains enabled gets no domain access until the owner
 * assigns one — see docs/RBAC_OPERATING_MODEL.md.
 */
import { useActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import {
  domainsFromPlatformRole,
  functionalRoleFromPlatformRole,
  type MemberDomainFlags,
  type PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";
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

/**
 * Whether a primary-tab route is reachable for this member — used to skip boot
 * data/chunk warm-ups for domains the functional role can't open. Non-primary
 * routes (network hub, etc.) return true so unrelated warm-ups aren't blocked.
 */
export function memberCanAccessTabRoute(
  route: string,
  access: MemberDomainAccess,
): boolean {
  if (route === ROUTES.TABS.FINANCE) return access.finance;
  if (route === ROUTES.TABS.TRIPS) return access.tripops;
  if (route === ROUTES.TABS.NETWORK || route.includes("/network")) {
    return access.sales;
  }
  return true;
}

function resolveMemberDomains(
  memberDomains: MemberDomainFlags | null,
  memberPlatformRole: PlatformTeamRole | null,
): MemberDomainFlags {
  if (memberDomains) return memberDomains;
  // Legacy single-role path (no domains blob yet).
  const functional = functionalRoleFromPlatformRole(memberPlatformRole);
  if (functional) return domainsFromPlatformRole(memberPlatformRole);
  return { finance: false, sales: false, tripops: false };
}

export function useMemberCapabilities(): MemberDomainAccess {
  const capabilities = useCapabilities();
  const { memberRole, memberPlatformRole, memberDomains, isLoading } =
    useActiveWorkspace();

  return useMemo(() => {
    const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";

    const orgAllowsFinance = canAccessFinance(capabilities);
    const orgAllowsSales =
      capabilities.includes("marketplace_post") ||
      capabilities.includes("marketplace_bid") ||
      canAccessClients(capabilities) ||
      // Indents surfaces live under Sales; keep the domain unlocked for
      // give-load orgs that have dispatch but no marketplace/client caps.
      canAccessIndents(capabilities);
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

    // Admin platform role (non-owner) still bypasses domain gating.
    if (memberPlatformRole === "admin") {
      return {
        finance: orgAllowsFinance,
        sales: orgAllowsSales,
        tripops: orgAllowsTripOps,
        isLoading,
      };
    }

    const domains = resolveMemberDomains(memberDomains, memberPlatformRole);
    return {
      finance: orgAllowsFinance && domains.finance,
      sales: orgAllowsSales && domains.sales,
      tripops: orgAllowsTripOps && domains.tripops,
      isLoading,
    };
  }, [capabilities, memberRole, memberPlatformRole, memberDomains, isLoading]);
}
