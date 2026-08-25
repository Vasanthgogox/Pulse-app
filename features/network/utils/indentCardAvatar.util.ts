import type { ClientRow } from "@/features/clients/services/clients.service";
import type { IndentRow } from "@/features/indents";
import { linkedOrgAvatarFields } from "@/features/trips/components/TripsHubViews";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type IndentCardAvatarProps = {
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed: string;
};

/** Give load: show the indent's client photo / linked org logo. */
export function giveLoadIndentAvatarProps(
  load: IndentRow,
  clientById: Map<string, ClientRow>,
  linkedOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardAvatarProps {
  const clientId = (load.client_id ?? "").trim();
  const client = clientId ? clientById.get(clientId) : undefined;
  const orgFields = linkedOrgAvatarFields(
    client?.linked_organization_id,
    linkedOrgMap,
  );
  return {
    avatarUrl: (client?.avatar_url ?? "").trim() || null,
    avatarSeed: (client?.avatar_seed ?? "").trim() || null,
    organizationImageUrl: orgFields.organizationImageUrl ?? null,
    organizationAvatarSeed: orgFields.organizationAvatarSeed ?? null,
    initialsColorSeed: clientId
      ? `client-entity:${clientId}`
      : `indent:${load.id}`,
  };
}

/** Find work / market load: show the posting organization's logo. */
export function marketLoadIndentAvatarProps(
  load: IndentRow,
  creatorOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardAvatarProps {
  const orgId = (load.organization_id ?? "").trim();
  const org = orgId && creatorOrgMap ? creatorOrgMap[orgId] : undefined;
  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: (org?.avatarUrl ?? "").trim() || null,
    organizationAvatarSeed: (org?.avatarSeed ?? "").trim() || null,
    initialsColorSeed: orgId ? `org:${orgId}` : `indent:${load.id}`,
  };
}

/**
 * Find loads / opportunity story cards — same hierarchy as Get Load hub:
 * batch partner display (logo → owner avatar → seed) with feed fields as
 * optimistic fallback until the batch resolves.
 */
export function opportunityPostAvatarProps(
  post: {
    id: string;
    organization_id?: string | null;
    org_avatar_url?: string | null;
    org_avatar_seed?: string | null;
  },
  creatorOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardAvatarProps {
  const orgId = (post.organization_id ?? "").trim();
  const org = orgId && creatorOrgMap ? creatorOrgMap[orgId] : undefined;
  const batchUrl = (org?.avatarUrl ?? "").trim() || null;
  const batchSeed = (org?.avatarSeed ?? "").trim() || null;
  const feedUrl = (post.org_avatar_url ?? "").trim() || null;
  const feedSeed = (post.org_avatar_seed ?? "").trim() || null;
  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: batchUrl || feedUrl,
    organizationAvatarSeed: batchSeed || feedSeed,
    initialsColorSeed: orgId ? `org:${orgId}` : `post:${post.id}`,
  };
}
