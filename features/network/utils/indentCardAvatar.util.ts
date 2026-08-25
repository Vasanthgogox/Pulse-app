import type { ClientRow } from "@/features/clients/services/clients.service";
import type { IndentRow } from "@/features/indents";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type IndentCardAvatarProps = {
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed: string;
};

function normalizePartyName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function linkedOrgAvatarFields(
  linkedOrgId: string | null | undefined,
  linkedMap: Record<string, LinkedOrgDisplay> | undefined,
): {
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
} {
  const id = (linkedOrgId ?? "").trim();
  if (!id || !linkedMap) return {};
  const o = linkedMap[id];
  if (!o) return {};
  return {
    organizationImageUrl: o.avatarUrl ?? null,
    organizationAvatarSeed: o.avatarSeed ?? null,
  };
}

/**
 * Indents persist `client_name` only (no `client_id` column). Prefer id when
 * present on the row, else match CRM clients by name (case-insensitive).
 */
export function resolveGiveLoadClient(
  load: Pick<IndentRow, "client_id" | "client_name">,
  clientById: Map<string, ClientRow>,
): ClientRow | undefined {
  const clientId = String(load.client_id ?? "").trim();
  if (clientId) {
    const byId = clientById.get(clientId);
    if (byId) return byId;
  }
  const wanted = normalizePartyName(load.client_name);
  if (!wanted) return undefined;
  for (const client of clientById.values()) {
    if (normalizePartyName(client.name) === wanted) return client;
  }
  return undefined;
}

/** Give load: show the indent's client photo / linked org logo. */
export function giveLoadIndentAvatarProps(
  load: IndentRow,
  clientById: Map<string, ClientRow>,
  linkedOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardAvatarProps {
  const client = resolveGiveLoadClient(load, clientById);
  const orgFields = linkedOrgAvatarFields(
    client?.linked_organization_id,
    linkedOrgMap,
  );
  const clientAvatarUrl = (client?.avatar_url ?? "").trim() || null;
  const clientAvatarSeed = (client?.avatar_seed ?? "").trim() || null;
  /**
   * Profiles RPC puts org logo on `client.avatar_url`. Prefer linked-org batch
   * when present; otherwise use the client profile photo as org mark so cards
   * don't fall back to initials when `client_id` was never stored on the indent.
   */
  const organizationImageUrl =
    (orgFields.organizationImageUrl ?? "").trim() || clientAvatarUrl;
  const organizationAvatarSeed =
    (orgFields.organizationAvatarSeed ?? "").trim() || clientAvatarSeed;

  return {
    avatarUrl: clientAvatarUrl,
    avatarSeed: clientAvatarSeed,
    organizationImageUrl,
    organizationAvatarSeed,
    initialsColorSeed: client?.id
      ? `client-entity:${client.id}`
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
