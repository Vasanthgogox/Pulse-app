import { useEffect, useState } from "react";

import {
  getClientById,
  getLinkedOrgProfile,
} from "@/features/clients/services/clients.service";
import {
  resolveIndentPartnerPublicProfile,
  type IndentPartnerPublicProfileTarget,
} from "@/features/indents/utils/indentPartnerPublicProfile.util";

export type IndentClientAvatarFields = {
  avatarUrl: string | null;
  avatarSeed: string | null;
  organizationImageUrl: string | null;
  organizationAvatarSeed: string | null;
};

const EMPTY: IndentClientAvatarFields = {
  avatarUrl: null,
  avatarSeed: null,
  organizationImageUrl: null,
  organizationAvatarSeed: null,
};

function isUuid(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * Resolves avatar fields for the freight card "Client entity" row.
 * Owners: client record (+ linked org). Suppliers: shipper org display via partner RPC.
 */
export function useIndentClientEntityAvatar(options: {
  clientId: string | null | undefined;
  ownerOrgId: string | null;
  shipperOrgId: string | null | undefined;
  isOwner: boolean;
  enabled: boolean;
}): {
  fields: IndentClientAvatarFields;
  canOpenPublicProfile: boolean;
  publicProfileClientId: string | null;
  publicProfileTarget: IndentPartnerPublicProfileTarget | null;
} {
  const { clientId, ownerOrgId, shipperOrgId, isOwner, enabled } = options;
  const [fields, setFields] = useState<IndentClientAvatarFields>(EMPTY);
  const [publicProfileTarget, setPublicProfileTarget] =
    useState<IndentPartnerPublicProfileTarget | null>(null);

  const publicProfileClientId =
    isOwner && isUuid(clientId) ? (clientId as string) : null;
  const canOpenPublicProfile = isOwner
    ? !!publicProfileClientId
    : !!publicProfileTarget;

  useEffect(() => {
    if (!enabled) {
      setFields(EMPTY);
      return;
    }

    let cancelled = false;

    async function loadOwnerClient() {
      if (!ownerOrgId || !isUuid(clientId)) return;
      const { client } = await getClientById(ownerOrgId, clientId as string);
      if (cancelled || !client) return;

      const next: IndentClientAvatarFields = {
        avatarUrl: (client.avatar_url ?? "").trim() || null,
        avatarSeed: (client.avatar_seed ?? "").trim() || null,
        organizationImageUrl: null,
        organizationAvatarSeed: null,
      };

      if (client.linked_organization_id) {
        const { profile } = await getLinkedOrgProfile(client.linked_organization_id);
        if (!cancelled && profile) {
          next.organizationImageUrl = (profile.avatarUrl ?? "").trim() || null;
          next.organizationAvatarSeed = (profile.avatarSeed ?? "").trim() || null;
        }
      }

      if (!cancelled) setFields(next);
    }

    async function loadShipperOrg() {
      const orgId = (shipperOrgId ?? "").trim();
      if (!orgId) return;
      const { profile } = await getLinkedOrgProfile(orgId);
      if (cancelled || !profile) return;
      setFields({
        avatarUrl: null,
        avatarSeed: null,
        organizationImageUrl: (profile.avatarUrl ?? "").trim() || null,
        organizationAvatarSeed: (profile.avatarSeed ?? "").trim() || null,
      });
    }

    setFields(EMPTY);
    setPublicProfileTarget(null);

    async function loadSupplierPublicProfileTarget() {
      const viewerOrgId = (ownerOrgId ?? "").trim();
      const partnerOrgId = (shipperOrgId ?? "").trim();
      if (!viewerOrgId || !partnerOrgId) return;
      const target = await resolveIndentPartnerPublicProfile(
        viewerOrgId,
        partnerOrgId,
      );
      if (!cancelled) setPublicProfileTarget(target);
    }

    if (isOwner) {
      void loadOwnerClient();
    } else {
      void loadShipperOrg();
      void loadSupplierPublicProfileTarget();
    }

    return () => {
      cancelled = true;
    };
  }, [clientId, ownerOrgId, shipperOrgId, isOwner, enabled]);

  return {
    fields,
    canOpenPublicProfile,
    publicProfileClientId,
    publicProfileTarget,
  };
}
