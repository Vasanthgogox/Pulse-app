/**
 * Resolve “who assigned this trip?” for driver UI (asset roster, aggregate OTP, assign-by-phone).
 * Mirrors logic in app/(driver)/index.tsx notifications / assignment card.
 */
import type { TripRow } from "@/services/tripsService";

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
  commission_percent?: number | null;
  commission_per_km?: number | null;
  status?: string | null;
};

export type AssignerResolutionDeps = {
  assignmentActorByTripId: Record<string, string>;
  assignerNamesByUserId: Record<string, string>;
  assignerOrgNameByUserId?: Record<string, string>;
  assignerDisplayByTripId: Record<string, string>;
  organizationNamesById: Record<string, string>;
};

export type AssignerDisplayResult = {
  assignedByUserName: string | null;
  assignedByOrgName: string;
  assignerPersonDisplay: string;
  assignedByName: string;
};

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
  const isAggregateTrip = !!String(trip.supplier_id ?? "").trim();

  const tripAssignedByUserNameCandidates = [
    tripMeta.assigned_by_name,
    tripMeta.assigned_by_user_name,
    tripMeta.assigned_by,
    tripMeta.created_by_name,
    tripMeta.dispatcher_name,
  ];
  /** Fleet / assigning org — never use client/supplier names (those are cargo parties). */
  const tripAssignedByOrgNameCandidates = [
    deps.assignerOrgNameByUserId?.[assignerUserId] ?? null,
    deps.organizationNamesById[(trip.organization_id ?? "").trim()] ?? null,
    ...(isAggregateTrip ? [] : [inviteForTrip?.from_org_name ?? null]),
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
    (isAggregateTrip
      ? "Assigning organization"
      : (trip.organization_id ?? "").trim() ===
            (driverOrganizationId ?? "").trim()
        ? "Your fleet"
        : "Assigning fleet");

  const assignerPersonDisplay =
    (assignedByUserName ?? "").trim() || "Fleet dispatcher";

  const assignedByName = `${assignerPersonDisplay} · ${assignedByOrgName}`;

  return {
    assignedByUserName,
    assignedByOrgName,
    assignerPersonDisplay,
    assignedByName,
  };
}
