import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type { SharedLedgerNotificationRow } from "@/features/finance/services/sharedLedgerNotifications.service";
import type { InboundPartnerDisplay } from "@/lib/globalSync/inboundProtocol.types";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { ActiveTripSummary } from "@/lib/globalSync/types";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type { CurrentOrganization } from "@/types/organization";

export type RegistryNotificationAvatar = {
  name: string;
  entityType?: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed?: string | null;
};

function driverFallbackSeed(driverId: string): string {
  const value = (driverId ?? "").trim() || "driver";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash + value.charCodeAt(i)) % 10;
  }
  return `driver-${hash + 1}`;
}

function driverAvatarFromRow(
  driver: Pick<DriverRow, "avatar_url" | "avatar_seed"> | undefined,
  name: string,
  driverId: string,
): RegistryNotificationAvatar {
  return {
    name,
    entityType: "driver",
    avatarUrl: driver?.avatar_url ?? null,
    avatarSeed: driver?.avatar_seed?.trim() || driverFallbackSeed(driverId),
    initialsColorSeed: driverId,
  };
}

function orgAvatar(
  org: CurrentOrganization | null | undefined,
  name: string,
): RegistryNotificationAvatar {
  return {
    name: org?.name?.trim() || name,
    entityType: "client",
    organizationImageUrl: org?.logo_url ?? null,
    initialsColorSeed: org?.id ?? name,
  };
}

function partnerAvatar(
  partnerOrgId: string | null | undefined,
  partnerDisplay: Record<string, InboundPartnerDisplay>,
  partnerAvatarUri: Record<string, string | null>,
  fallbackName: string,
): RegistryNotificationAvatar {
  if (!partnerOrgId) {
    return { name: fallbackName, entityType: "client", initialsColorSeed: fallbackName };
  }
  const profile = partnerDisplay[partnerOrgId];
  const resolvedUri = partnerAvatarUri[partnerOrgId];
  return {
    name: profile?.organizationName?.trim() || fallbackName,
    entityType: "client",
    organizationImageUrl:
      profile?.logoUrl ?? profile?.avatarUrl ?? resolvedUri ?? null,
    organizationAvatarSeed: profile?.orgAvatarSeed ?? profile?.avatarSeed ?? null,
    avatarUrl: profile?.ownerAvatarUrl ?? null,
    avatarSeed: profile?.avatarSeed ?? null,
    initialsColorSeed: partnerOrgId,
  };
}

function salaryDriverProfile(req: SalaryRequestWithDriverRow) {
  const nested = req.drivers as
    | (SalaryRequestWithDriverRow["drivers"] & {
        profiles?: { avatar_url?: string | null; avatar_seed?: string | null } | null;
      })
    | null
    | undefined;
  return nested?.profiles ?? null;
}

export function resolveSalaryRegistryAvatar(
  req: SalaryRequestWithDriverRow,
  driversById: Map<string, DriverRow>,
): RegistryNotificationAvatar {
  const name = req.drivers?.name?.trim() || "Driver";
  const cached = driversById.get(req.driver_id);
  const profile = salaryDriverProfile(req);
  const merged = cached ?? {
    avatar_url: profile?.avatar_url ?? null,
    avatar_seed: profile?.avatar_seed ?? null,
  };
  return driverAvatarFromRow(merged, name, req.driver_id);
}

export function resolveOpsRegistryAvatar(
  ops: GlobalOperationAlert,
  ctx: {
    activeTrips: ActiveTripSummary[];
    driversById: Map<string, DriverRow>;
    org: CurrentOrganization | null | undefined;
    partnerDisplay: Record<string, InboundPartnerDisplay>;
    partnerAvatarUri: Record<string, string | null>;
  },
): RegistryNotificationAvatar {
  const trip = ops.trip_id
    ? ctx.activeTrips.find((t) => t.trip_id === ops.trip_id)
    : undefined;

  if (trip?.driver_id) {
    const driverName = trip.driver_display_name?.trim() || "Driver";
    return driverAvatarFromRow(
      ctx.driversById.get(trip.driver_id),
      driverName,
      trip.driver_id,
    );
  }

  return orgAvatar(ctx.org, "System");
}

export function resolveSharedRegistryAvatar(
  item: SharedLedgerNotificationRow,
  ctx: {
    org: CurrentOrganization | null | undefined;
    partnerDisplay: Record<string, InboundPartnerDisplay>;
    partnerAvatarUri: Record<string, string | null>;
  },
): RegistryNotificationAvatar {
  if (item.partner_org_id) {
    return partnerAvatar(
      item.partner_org_id,
      ctx.partnerDisplay,
      ctx.partnerAvatarUri,
      item.title,
    );
  }
  return {
    name: item.title?.trim() || "Partner",
    entityType: "client",
    initialsColorSeed: item.id,
  };
}
