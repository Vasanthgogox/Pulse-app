import type { IntegratedChat } from "@/features/chat/contexts/IntegratedChatContext";
import type {
  ConversationPartyType,
  TripConversation,
  TripMessageRow,
} from "@/features/chat/types/chat.types";
import type { TripForCompose } from "@/features/chat/services/chat.service";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type ChatOrgBranding =
  | LinkedOrgDisplay
  | {
      logoUrl?: string | null;
      orgAvatarSeed?: string | null;
      avatarUrl?: string | null;
      avatarSeed?: string | null;
    };

export function partyEntityTypeFromConversation(
  partyType: ConversationPartyType,
): PartyEntityType {
  if (partyType === "driver") return "driver";
  if (partyType === "supplier") return "supplier";
  return "client";
}

function linkedOrgBrandingFields(
  linkedOrgId: string | null | undefined,
  brandingMap: Record<string, ChatOrgBranding>,
): Pick<
  ResolvedPartyAvatarIdentity,
  "organizationImageUrl" | "organizationAvatarSeed"
> {
  const id = (linkedOrgId ?? "").trim();
  if (!id) return {};
  const branding = brandingMap[id];
  if (!branding) return {};
  const logo =
    "logoUrl" in branding
      ? (branding.logoUrl ?? "").trim() || null
      : (branding.avatarUrl ?? "").trim() || null;
  const seed =
    "orgAvatarSeed" in branding
      ? (branding.orgAvatarSeed ?? "").trim() || null
      : (branding.avatarSeed ?? "").trim() || null;
  return {
    organizationImageUrl: logo,
    organizationAvatarSeed: seed,
  };
}

export function resolveNetworkPartnerAvatar(
  chat: Pick<
    IntegratedChat,
    "partnerId" | "partnerName" | "partnerLogoUrl" | "partnerAvatarSeed"
  >,
): ResolvedPartyAvatarIdentity {
  return {
    displayName: chat.partnerName,
    entityType: "client",
    organizationImageUrl: chat.partnerLogoUrl ?? null,
    organizationAvatarSeed: chat.partnerAvatarSeed ?? null,
    avatarUrl: null,
    avatarSeed: chat.partnerAvatarSeed ?? null,
  };
}

export function resolveTripConversationAvatar(
  conv: Pick<TripConversation, "party_type" | "party_name" | "client_id" | "supplier_id">,
  composeTrip: TripForCompose | null | undefined,
  brandingMap: Record<string, ChatOrgBranding>,
  avatarSeed?: string | null,
): ResolvedPartyAvatarIdentity {
  const name = (conv.party_name ?? "").trim() || "Partner";
  const entityType = partyEntityTypeFromConversation(conv.party_type);
  const linkedOrgId =
    conv.party_type === "client"
      ? composeTrip?.client_linked_organization_id
      : conv.party_type === "supplier"
        ? composeTrip?.supplier_linked_organization_id
        : null;
  return {
    displayName: name,
    entityType,
    ...linkedOrgBrandingFields(linkedOrgId, brandingMap),
    avatarSeed: (avatarSeed ?? "").trim() || null,
  };
}

function driverFallbackSeed(driverId: string): string {
  const value = (driverId ?? "").trim() || "driver";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash + value.charCodeAt(i)) % 10;
  }
  return `driver-${hash + 1}`;
}

function cleanSystemUpdateDriverName(name: string): string | null {
  const n = name.trim().replace(/\.$/, "");
  if (!n || /^(the driver|driver|assigned|tbd)$/i.test(n)) return null;
  return n;
}

/** Parse driver name from assignment / status broadcast copy in trip chat. */
export function extractDriverNameFromSystemUpdateContent(
  content: string,
): string | null {
  const c = (content ?? "").trim();
  if (!c) return null;

  let m = c.match(
    /assigned\.\s*(?:Driver\s+)?([A-Za-z][A-Za-z\s.'-]{0,40}?)\s+will report shortly/i,
  );
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/^([A-Za-z][A-Za-z\s.'-]{0,40}?)\s+assigned as driver/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/Driver changed from .+ to ([A-Za-z][A-Za-z\s.'-]+)/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/Driver reassigned to ([A-Za-z][A-Za-z\s.'-]+)/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/^Driver\s+([A-Za-z][A-Za-z\s.'-]+)\s+unassigned/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(
    /([A-Za-z][A-Za-z\s.'-]{0,40}?)\s+has accepted the trip and is heading to pickup/i,
  );
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  return null;
}

function readAssignmentEventPayload(
  meta: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const ep = meta?.event_payload;
  if (ep && typeof ep === "object" && !Array.isArray(ep)) {
    return ep as Record<string, unknown>;
  }
  return meta;
}

export type SystemUpdateDriverContext = {
  composeTrip?: Pick<
    TripForCompose,
    "driver_id" | "driver_display_name"
  > | null;
};

/** Driver avatar for SYSTEM UPDATE cards (assignment + assigned status broadcasts). */
export function resolveSystemUpdateDriverAvatar(
  message: Pick<TripMessageRow, "content" | "metadata">,
  context?: SystemUpdateDriverContext,
): ResolvedPartyAvatarIdentity | null {
  const meta = (message.metadata ?? null) as Record<string, unknown> | null;
  const ep = readAssignmentEventPayload(meta);

  const driverId =
    (typeof ep?.driver_id_new === "string" ? ep.driver_id_new : null) ||
    (typeof meta?.driver_id_new === "string" ? meta.driver_id_new : null) ||
    (context?.composeTrip?.driver_id ?? null);

  const metaName =
    (typeof ep?.driver_display_name === "string"
      ? ep.driver_display_name
      : null
    )?.trim() || null;
  const metaAvatarUrl =
    (typeof ep?.driver_avatar_url === "string" ? ep.driver_avatar_url : null) ||
    (typeof meta?.driver_avatar_url === "string" ? meta.driver_avatar_url : null);
  const metaAvatarSeed =
    (typeof ep?.driver_avatar_seed === "string"
      ? ep.driver_avatar_seed
      : null) ||
    (typeof meta?.driver_avatar_seed === "string"
      ? meta.driver_avatar_seed
      : null);

  const contentName = extractDriverNameFromSystemUpdateContent(
    message.content ?? "",
  );
  const composeName =
    (context?.composeTrip?.driver_display_name ?? "").trim() || null;

  let displayName =
    metaName ||
    contentName ||
    (driverId &&
    composeName &&
    context?.composeTrip?.driver_id === driverId
      ? composeName
      : null) ||
    composeName;

  if (displayName && /^(driver|assigned|the driver)$/i.test(displayName)) {
    displayName = contentName;
  }

  if (!driverId && !displayName) return null;

  return {
    displayName: displayName ?? "Driver",
    entityType: "driver",
    avatarUrl: metaAvatarUrl,
    avatarSeed:
      metaAvatarSeed?.trim() ||
      (driverId ? driverFallbackSeed(driverId) : null),
  };
}

export function resolveTripMessagePeerAvatar(params: {
  message: Pick<TripMessageRow, "sender_role" | "sender_name" | "sender_avatar_seed">;
  conversationPartyType: ConversationPartyType;
  composeTrip: TripForCompose | null | undefined;
  brandingMap: Record<string, ChatOrgBranding>;
  fallbackName: string;
}): ResolvedPartyAvatarIdentity {
  const role = params.message.sender_role;
  const entityType: PartyEntityType =
    role === "driver"
      ? "driver"
      : role === "supplier"
        ? "supplier"
        : role === "client"
          ? "client"
          : partyEntityTypeFromConversation(params.conversationPartyType);

  let linkedOrgId: string | null = null;
  if (entityType === "client") {
    linkedOrgId = params.composeTrip?.client_linked_organization_id ?? null;
  } else if (entityType === "supplier") {
    linkedOrgId = params.composeTrip?.supplier_linked_organization_id ?? null;
  }

  const displayName =
    (params.message.sender_name ?? "").trim() ||
    params.fallbackName ||
    "Partner";

  return {
    displayName,
    entityType,
    ...linkedOrgBrandingFields(linkedOrgId, params.brandingMap),
    avatarSeed: (params.message.sender_avatar_seed ?? "").trim() || null,
  };
}
