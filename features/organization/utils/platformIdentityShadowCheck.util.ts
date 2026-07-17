import { logger } from "@/lib/logger";
import {
  getCurrentUserMemberships,
  getInvitationsForCurrentUser,
  getOrganizationsForCurrentUser,
} from "../services/platformOrganization.service";

export type PlatformIdentityShadowFlow = "business_signup" | "invitation_join";

/**
 * Real, ID-level reconciliation. Only meaningful where a legacy bridge key exists —
 * today that is organizations only, via `platform.organizations.legacy_organization_id`.
 */
export interface ComparisonResult {
  matched: boolean;
  missing: string[];
  unexpected: string[];
  legacyCount: number;
  platformCount: number;
}

/**
 * Platform-side count only. `platform.memberships` and `platform.invitations` have no
 * `legacy_*_id` bridge column (unlike `platform.organizations`), so ID-level reconciliation
 * isn't possible for these two entities yet — adding those bridge columns would be its own,
 * larger schema decision, not something this util should assume or approximate. Treat this
 * as a smoke-test signal only, never as evidence of drift.
 */
export interface PlatformOnlyCount {
  platformCount: number;
}

export interface PlatformIdentityComparison {
  flow: PlatformIdentityShadowFlow;
  organizations: ComparisonResult;
  memberships: PlatformOnlyCount;
  invitations: PlatformOnlyCount;
}

function reconcileOrganizations(
  legacyOrganizationIds: string[],
  platformOrganizations: { legacy_organization_id: string | null }[],
): ComparisonResult {
  const platformLegacyIds = new Set(
    platformOrganizations
      .map((o) => o.legacy_organization_id)
      .filter((id): id is string => id != null),
  );
  const legacyIdSet = new Set(legacyOrganizationIds);

  return {
    matched:
      legacyOrganizationIds.every((id) => platformLegacyIds.has(id)) &&
      [...platformLegacyIds].every((id) => legacyIdSet.has(id)),
    missing: legacyOrganizationIds.filter((id) => !platformLegacyIds.has(id)),
    unexpected: [...platformLegacyIds].filter((id) => !legacyIdSet.has(id)),
    legacyCount: legacyOrganizationIds.length,
    platformCount: platformOrganizations.length,
  };
}

/**
 * Shadow Mode invariants — this function MUST NOT:
 *   - retry
 *   - mutate
 *   - repair
 *   - accept invitations
 *   - provision organizations
 *   - switch workspaces
 *   - influence UI
 *   - influence navigation
 * Its only responsibility is Read → Compare → Log. It is never awaited by a caller's
 * critical path and never influences control flow (returns void).
 *
 * Calls the read-only Platform Identity adapter
 * (features/organization/services/platformOrganization.service.ts) alongside the legacy
 * public.organizations-based signup/invitation-join paths, purely to observe real
 * production behavior ahead of any cutover decision (docs/decisions.md ADR-001/ADR-002).
 * No backfill populates `platform.organizations.legacy_organization_id` yet, so
 * `organizations.matched === false` is the expected outcome today, not an error signal —
 * this becomes meaningful the moment a backfill starts populating that column.
 */
/** PostgREST 406 when `platform` is not in exposed schemas — expected until cutover. */
function isPlatformSchemaUnavailable(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("invalid schema: platform") || m.includes('schema "platform"');
}

function allFailedReadsAreSchemaUnavailable(errors: Array<string | null>): boolean {
  const present = errors.filter((e): e is string => e != null && e.length > 0);
  return present.length > 0 && present.every(isPlatformSchemaUnavailable);
}

export async function shadowCheckPlatformIdentity(context: {
  flow: PlatformIdentityShadowFlow;
  legacyOrganizationIds: string[];
}): Promise<void> {
  try {
    const [orgsResult, membershipsResult, invitationsResult] = await Promise.all([
      getOrganizationsForCurrentUser(),
      getCurrentUserMemberships(),
      getInvitationsForCurrentUser(),
    ]);

    if (orgsResult.error || membershipsResult.error || invitationsResult.error) {
      const orgsError = orgsResult.error?.message ?? null;
      const membershipsError = membershipsResult.error?.message ?? null;
      const invitationsError = invitationsResult.error?.message ?? null;
      const payload = {
        flow: context.flow,
        orgsError,
        membershipsError,
        invitationsError,
      };

      // Schema not exposed yet → expected; do not escalate to Sentry (logger.warn → captureMessage).
      if (allFailedReadsAreSchemaUnavailable([orgsError, membershipsError, invitationsError])) {
        logger.debug("platform_identity_shadow_schema_unavailable", payload);
        return;
      }

      logger.warn("platform_identity_shadow_read_failed", payload);
      return;
    }

    const comparison: PlatformIdentityComparison = {
      flow: context.flow,
      organizations: reconcileOrganizations(
        context.legacyOrganizationIds,
        orgsResult.organizations,
      ),
      memberships: { platformCount: membershipsResult.memberships.length },
      invitations: { platformCount: invitationsResult.invitations.length },
    };

    logger.debug("platform_identity_shadow", {
      event: "platform_identity_shadow",
      flow: comparison.flow,
      matched: comparison.organizations.matched,
      organizationMismatch: !comparison.organizations.matched,
      organizationMissing: comparison.organizations.missing,
      organizationUnexpected: comparison.organizations.unexpected,
      organizationLegacyCount: comparison.organizations.legacyCount,
      organizationPlatformCount: comparison.organizations.platformCount,
      membershipPlatformCount: comparison.memberships.platformCount,
      invitationPlatformCount: comparison.invitations.platformCount,
    });
  } catch (e) {
    logger.warn("platform_identity_shadow_unexpected_failure", {
      flow: context.flow,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
