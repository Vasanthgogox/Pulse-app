/**
 * Resolve “who assigned this trip?” for driver UI (asset roster, aggregate OTP, assign-by-phone).
 * Mirrors logic in app/(driver)/index.tsx notifications / assignment card.
 */
import type { TripRow } from "@/features/trips/services/trips.service";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuidFragment(s: string): boolean {
  const t = String(s ?? "").trim();
  if (!t) return false;
  if (UUID_V4_RE.test(t)) return true;
  if (/^[0-9a-f]{6,12}$/i.test(t)) return true;
  return false;
}

/** Prefer assignment audit actor (who assigned driver), then explicit assigner ids, then creator. */
export function resolveAssignerUserId(
  trip: TripRow,
  auditActorByTripId: Record<string, string>,
): string {
  const meta = trip as TripRow &
    Record<string, string | number | boolean | null | undefined>;
  const audit = (auditActorByTripId[String(trip.id)] ?? "").trim();
  const assignedByUserId = String(meta.assigned_by_user_id ?? "").trim();
  const createdByUserId = String(trip.created_by_user_id ?? "").trim();
  const ownerUserId = String(meta.owner_user_id ?? "").trim();
  const statusUpdatedBy = String(meta.status_updated_by ?? "").trim();
  const assignedBy = String(meta.assigned_by ?? "").trim();
  const createdBy = String(trip.created_by ?? "").trim();

  if (audit) return audit;
  if (assignedByUserId) return assignedByUserId;
  if (createdByUserId) return createdByUserId;
  if (ownerUserId) return ownerUserId;
  if (statusUpdatedBy) return statusUpdatedBy;
  if (assignedBy && UUID_V4_RE.test(assignedBy)) return assignedBy;
  if (createdBy && UUID_V4_RE.test(createdBy)) return createdBy;
  return "";
}

export function humanizeAssignerDisplayName(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (looksLikeUuidFragment(t)) return "";
  const lower = t.toLowerCase();
  if (lower === "partner") return "";
  if (/^user\s+/i.test(t)) {
    const rest = t.replace(/^user\s+/i, "").trim();
    if (looksLikeUuidFragment(rest) || /^[0-9a-f-]{6,}$/i.test(rest)) return "";
  }
  return t;
}

export type DriverInviteLite = {
  from_organization_id?: string | null;
  from_org_name?: string | null;
  from_org_logo_url?: string | null;
  from_org_avatar_url?: string | null;
  from_org_avatar_seed?: string | null;
  commission_percent?: number | null;
  commission_per_km?: number | null;
  status?: string | null;
};

/** How the driver should treat this assignment (fleet payroll vs direct / partner). */
export type JobCardAssignmentSourceKind =
  | "your_fleet"
  | "employer"
  | "direct"
  | "partner";

export type JobCardAssignerPayload = {
  kind: JobCardAssignmentSourceKind;
  kindLabel: string;
  linePrimary: string;
  lineSecondary: string;
  orgId: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgAvatarSeed?: string | null;
  orgAvatarUrl?: string | null;
};

export function resolveJobCardAssignmentSourceKind(
  trip: TripRow,
  driverOrganizationId: string | null | undefined,
  flags: { requiresOtp: boolean; isAggregate: boolean; isRoster: boolean },
  acceptedInviteForOrg: DriverInviteLite | null,
): Pick<JobCardAssignerPayload, "kind" | "kindLabel"> {
  const tripOrgId = (trip.organization_id ?? "").trim();
  const driverOrgId = (driverOrganizationId ?? "").trim();
  const isOwnFleet = Boolean(tripOrgId && driverOrgId && tripOrgId === driverOrgId);
  const hasAcceptedEmployer =
    acceptedInviteForOrg != null &&
    String(acceptedInviteForOrg.status ?? "").toLowerCase() === "accepted";

  if (flags.requiresOtp || flags.isAggregate) {
    return { kind: "direct", kindLabel: "DIRECT TRIP" };
  }
  if (isOwnFleet) {
    return { kind: "your_fleet", kindLabel: "YOUR FLEET" };
  }
  if (hasAcceptedEmployer || flags.isRoster) {
    return { kind: "employer", kindLabel: "EMPLOYER" };
  }
  return { kind: "partner", kindLabel: "PARTNER FLEET" };
}

/** Structured assigner block for JobRequestCard (avatar + trip-source badge). */
export function buildJobCardAssignerPayload(
  trip: TripRow,
  assigner: Pick<
    AssignerDisplayResult,
    "assignerLinePrimary" | "assignerLineSecondary" | "assignedByOrgName"
  >,
  driverOrganizationId: string | null | undefined,
  inviteForOrg: DriverInviteLite | null,
  flags: { requiresOtp: boolean; isAggregate: boolean; isRoster: boolean },
  orgLogoFromDb?: string | null,
): JobCardAssignerPayload {
  const acceptedInvite =
    inviteForOrg &&
    String(inviteForOrg.status ?? "").toLowerCase() === "accepted"
      ? inviteForOrg
      : null;
  const { kind, kindLabel } = resolveJobCardAssignmentSourceKind(
    trip,
    driverOrganizationId,
    flags,
    acceptedInvite,
  );
  const orgId = (trip.organization_id ?? "").trim();
  return {
    kind,
    kindLabel,
    linePrimary: assigner.assignerLinePrimary,
    lineSecondary: assigner.assignerLineSecondary,
    orgId,
    orgName: assigner.assignedByOrgName,
    orgLogoUrl: inviteForOrg?.from_org_logo_url ?? orgLogoFromDb ?? null,
    orgAvatarSeed: inviteForOrg?.from_org_avatar_seed ?? null,
    orgAvatarUrl: inviteForOrg?.from_org_avatar_url ?? null,
  };
}

export type AssignerResolutionDeps = {
  assignmentActorByTripId: Record<string, string>;
  assignerNamesByUserId: Record<string, string>;
  assignerOrgNameByUserId?: Record<string, string>;
  assignerDisplayByTripId: Record<string, string>;
  /** SECURITY DEFINER RPC: fleet name for trips.organization_id (drivers may lack org SELECT). */
  assignerTripOrgNameByTripId?: Record<string, string>;
  organizationNamesById: Record<string, string>;
};

export type AssignerDisplayResult = {
  assignedByUserName: string | null;
  assignedByOrgName: string;
  assignerPersonDisplay: string;
  /** Bold / leading segment for driver UI: fleet when known, else person. */
  assignerLinePrimary: string;
  /** Muted / trailing segment: dispatcher when fleet leads, else fleet label. */
  assignerLineSecondary: string;
  assignedByName: string;
};

/** Cross-fleet placeholder when the assigning org name cannot be resolved client-side. */
export const DRIVER_ASSIGNING_FLEET_UNKNOWN_LABEL = "Assigning fleet";

/**
 * Driver-facing “Assigned by” line: lead with organization when we know it;
 * when the org is unknown, keep the person first so the line stays informative.
 */
export function assignerPrimarySecondaryForDriver(
  assignedByOrgName: string,
  assignerPersonDisplay: string,
): Pick<AssignerDisplayResult, "assignerLinePrimary" | "assignerLineSecondary"> {
  const unknownPeerOrg = assignedByOrgName === DRIVER_ASSIGNING_FLEET_UNKNOWN_LABEL;
  return unknownPeerOrg
    ? {
        assignerLinePrimary: assignerPersonDisplay,
        assignerLineSecondary: assignedByOrgName,
      }
    : {
        assignerLinePrimary: assignedByOrgName,
        assignerLineSecondary: assignerPersonDisplay,
      };
}

/**
 * Dispatcher / fleet attribution for a trip (not cargo-party client/supplier names).
 * Used on JobRequestCard, notifications list, etc.
 */
export function buildAssignerDisplayForTrip(
  trip: TripRow,
  invites: DriverInviteLite[],
  driverOrganizationId: string | null | undefined,
  deps: AssignerResolutionDeps,
): AssignerDisplayResult {
  const tripMeta = trip as TripRow &
    Record<string, string | number | boolean | null | undefined>;
  const inviteForTrip =
    invites.find(
      (i) =>
        (i.from_organization_id ?? "").trim() ===
        (trip.organization_id ?? "").trim(),
    ) ?? null;

  const assignerUserId = resolveAssignerUserId(
    trip,
    deps.assignmentActorByTripId,
  ).trim();

  const tripAssignedByUserNameCandidates = [
    tripMeta.assigned_by_name,
    tripMeta.assigned_by_user_name,
    tripMeta.assigned_by,
    tripMeta.created_by_name,
    tripMeta.dispatcher_name,
  ];
  /**
   * Fleet / assigning org. `inviteForTrip` matches `from_organization_id === trip.organization_id`,
   * so `from_org_name` is the owning fleet — not the aggregate `supplier_id` party.
   */
  const tripAssignedByOrgNameCandidates = [
    deps.assignerTripOrgNameByTripId?.[String(trip.id).trim()] ?? null,
    deps.assignerOrgNameByUserId?.[assignerUserId] ?? null,
    deps.organizationNamesById[(trip.organization_id ?? "").trim()] ?? null,
    inviteForTrip?.from_org_name ?? null,
    (tripMeta.organization_name as string | null | undefined) ?? null,
    (tripMeta.org_name as string | null | undefined) ?? null,
    (tripMeta.from_org_name as string | null | undefined) ?? null,
    (tripMeta.company_name as string | null | undefined) ?? null,
  ];
  const resolvedFromTripFields = tripAssignedByUserNameCandidates
    .map((value) => humanizeAssignerDisplayName(String(value ?? "")))
    .find((value) => value.length > 0);
  const resolvedFromProfiles = humanizeAssignerDisplayName(
    deps.assignerNamesByUserId[assignerUserId] ?? "",
  );
  const fromRpc = humanizeAssignerDisplayName(
    deps.assignerDisplayByTripId[String(trip.id)] ?? "",
  );
  const assignedByUserName =
    (fromRpc.length > 0 ? fromRpc : null) ??
    resolvedFromTripFields ??
    (resolvedFromProfiles.length > 0 ? resolvedFromProfiles : null);

  const assignedByOrgName =
    tripAssignedByOrgNameCandidates
      .map((value) => String(value ?? "").trim())
      .find((value) => value.length > 0) ??
    ((trip.organization_id ?? "").trim() ===
    (driverOrganizationId ?? "").trim()
      ? "Your fleet"
      : DRIVER_ASSIGNING_FLEET_UNKNOWN_LABEL);

  const assignerPersonDisplay =
    (assignedByUserName ?? "").trim() || "Fleet dispatcher";

  const { assignerLinePrimary, assignerLineSecondary } =
    assignerPrimarySecondaryForDriver(assignedByOrgName, assignerPersonDisplay);
  const assignedByName = `${assignerLinePrimary} · ${assignerLineSecondary}`;

  return {
    assignedByUserName,
    assignedByOrgName,
    assignerPersonDisplay,
    assignerLinePrimary,
    assignerLineSecondary,
    assignedByName,
  };
}
