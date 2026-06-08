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
