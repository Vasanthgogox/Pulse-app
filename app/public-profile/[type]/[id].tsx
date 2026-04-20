import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { useOrganization } from "@/contexts/OrganizationContext";
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import {
  getClientDetails,
  getLinkedOrgProfile,
} from "@/features/clients/services/clients.service";
import {
  getDriverById,
  getDriverProfileDisplay,
} from "@/features/drivers/services/drivers.service";
import PublicProfileScreen from "@/features/public-profile/components/PublicProfileScreen";
import {
  clientToPublicEntity,
  driverToPublicEntity,
  supplierToPublicEntity,
} from "@/features/public-profile/mappers";
import type {
  PublicProfileEntity,
  PublicProfileEntityType,
} from "@/features/public-profile/types";
import {
  getLinkedOrgProfileForSupplier,
  getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { useSafeBack } from "@/lib/useSafeBack";

/**
 * Stable deterministic seed for drivers without an avatar (same pattern as
 * network and driver-detail screens).
 */
function getDriverFallbackSeed(driverId: string): string {
  return `driver-${driverId}`;
}

type ParamShape = { type?: string | string[]; id?: string | string[] };

const VALID_TYPES: PublicProfileEntityType[] = ["client", "supplier", "driver"];

function pickParam(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return "";
}

/**
 * Resolve an avatar URL for a "linked org" profile — tries direct HTTP URL,
 * then signed storage path, then DiceBear seed fallback.
 */
async function resolveLinkedOrgAvatar(
  avatarUrl: string | null | undefined,
  avatarSeed: string | null | undefined,
): Promise<string | null> {
  const url = (avatarUrl ?? "").trim();
  const seed = (avatarSeed ?? "").trim();
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url) {
    const signed = await getSignedAvatarUrl(url);
    if (signed) return signed;
  }
  if (seed) return getUser2DAvatarUriForSeed(seed);
  return null;
}

export default function PublicProfileRoute() {
  const { type, id } = useLocalSearchParams<ParamShape>();
  const safeBack = useSafeBack();
  const { currentOrganization } = useOrganization();

  const entityType = pickParam(type) as PublicProfileEntityType;
  const entityId = pickParam(id);
  const isValidType = VALID_TYPES.includes(entityType);

  const [entity, setEntity] = useState<PublicProfileEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      setErrorMessage(null);

      if (!isValidType || !entityId) {
        if (mounted) {
          setErrorMessage("Unknown entity type or missing id.");
          setLoading(false);
        }
        return;
      }

      try {
        if (entityType === "client") {
          const { client, error } = await getClientDetails(entityId);
          if (error) throw error;
          if (!client) throw new Error("Client not found.");
          const mapped = clientToPublicEntity(client);
          if (client.linked_organization_id) {
            const { profile } = await getLinkedOrgProfile(
              client.linked_organization_id,
            );
            mapped.avatarUrl = await resolveLinkedOrgAvatar(
              profile?.avatarUrl,
              profile?.avatarSeed,
            );
          }
          if (mounted) setEntity(mapped);
          return;
        }

        if (entityType === "supplier") {
          const { supplier, error } = await getSupplierDetails(entityId);
          if (error) throw error;
          if (!supplier) throw new Error("Supplier not found.");
          const mapped = supplierToPublicEntity(supplier);
          if (supplier.linked_organization_id) {
            const { profile } = await getLinkedOrgProfileForSupplier(
              supplier.linked_organization_id,
            );
            mapped.avatarUrl = await resolveLinkedOrgAvatar(
              profile?.avatarUrl,
              profile?.avatarSeed,
            );
          }
          if (mounted) setEntity(mapped);
          return;
        }

        /* driver */
        const orgId = currentOrganization?.id;
        if (!orgId) throw new Error("No active organization.");
        const { driver, error } = await getDriverById(orgId, entityId);
        if (error) throw error;
        if (!driver) throw new Error("Driver not found.");
        const mapped = driverToPublicEntity(driver);

        let avatarUrl = (driver.avatar_url ?? "").trim();
        let avatarSeed = (driver.avatar_seed ?? "").trim();
        if (!avatarUrl && !avatarSeed) {
          const { profile } = await getDriverProfileDisplay(driver.id);
          avatarUrl = (profile?.avatarUrl ?? "").trim();
          avatarSeed = (profile?.avatarSeed ?? "").trim();
        }
        if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
          mapped.avatarUrl = avatarUrl;
        } else if (avatarUrl) {
          mapped.avatarUrl = (await getSignedAvatarUrl(avatarUrl)) ?? null;
        } else if (avatarSeed) {
          mapped.avatarUrl = getAvatarUriForSeed(avatarSeed);
        } else {
          mapped.avatarUrl = getAvatarUriForSeed(getDriverFallbackSeed(driver.id));
        }

        if (mounted) setEntity(mapped);
      } catch (err) {
        if (mounted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load profile.";
          setErrorMessage(msg);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [entityType, entityId, isValidType, currentOrganization?.id]);

  return (
    <PublicProfileScreen
      entity={entity}
      loading={loading}
      errorMessage={errorMessage}
      onBack={safeBack}
    />
  );
}
