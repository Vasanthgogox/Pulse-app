import { useEffect, useState } from "react";

import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getClientDetails,
  getLinkedOrgProfile,
} from "@/features/clients/services/clients.service";
import {
  getDriverById,
  getDriverProfileDisplay,
} from "@/features/drivers/services/drivers.service";
import {
  clientToPublicEntity,
  driverToPublicEntity,
  supplierToPublicEntity,
} from "@/features/public-profile/mappers";
import type {
  PublicProfileEntity,
  PublicProfileEntityType,
} from "@/features/public-profile/types";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import {
  getLinkedOrgProfileForSupplier,
  getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";

function applyLinkedOrgVerification(
  mapped: PublicProfileEntity,
  verificationStatus: string | null | undefined,
): void {
  const status = (verificationStatus ?? "").trim() || null;
  mapped.verificationStatus = status;
  mapped.isVerified = isOrgKycVerified({ verification_status: status });
}

function getDriverFallbackSeed(driverId: string): string {
  return `driver-${driverId}`;
}

async function resolveLinkedOrgAvatar(
  avatarUrl: string | null | undefined,
  avatarSeed: string | null | undefined,
): Promise<{ avatarUrl: string | null; avatarSeed: string | null }> {
  const url = (avatarUrl ?? "").trim();
  const seed = (avatarSeed ?? "").trim();
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { avatarUrl: url, avatarSeed: seed || null };
  }
  if (url) {
    const signed = await getSignedAvatarUrl(url);
    if (signed) return { avatarUrl: signed, avatarSeed: seed || null };
  }
  if (seed) {
    return { avatarUrl: getUser2DAvatarUriForSeed(seed), avatarSeed: seed };
  }
  return { avatarUrl: null, avatarSeed: null };
}

export function usePublicProfileEntity(
  entityType: PublicProfileEntityType | null,
  entityId: string | null,
): {
  entity: PublicProfileEntity | null;
  loading: boolean;
  errorMessage: string | null;
} {
  const { currentOrganization } = useOrganization();
  const [entity, setEntity] = useState<PublicProfileEntity | null>(null);
  const [loading, setLoading] = useState(() => Boolean(entityType && entityId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      if (!entityType || !entityId) {
        setEntity(null);
        setLoading(false);
        setErrorMessage(null);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

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
            const resolved = await resolveLinkedOrgAvatar(
              profile?.avatarUrl,
              profile?.avatarSeed,
            );
            mapped.avatarUrl = resolved.avatarUrl;
            mapped.avatarSeed = resolved.avatarSeed;
            applyLinkedOrgVerification(mapped, profile?.verificationStatus);
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
            const resolved = await resolveLinkedOrgAvatar(
              profile?.avatarUrl,
              profile?.avatarSeed,
            );
            mapped.avatarUrl = resolved.avatarUrl;
            mapped.avatarSeed = resolved.avatarSeed;
            applyLinkedOrgVerification(mapped, profile?.verificationStatus);
          }
          if (mounted) setEntity(mapped);
          return;
        }

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
          mapped.avatarSeed = avatarSeed || null;
        } else if (avatarUrl) {
          mapped.avatarUrl = (await getSignedAvatarUrl(avatarUrl)) ?? null;
          mapped.avatarSeed = avatarSeed || null;
        } else if (avatarSeed) {
          mapped.avatarUrl = getAvatarUriForSeed(avatarSeed);
          mapped.avatarSeed = avatarSeed;
        } else {
          const fallbackSeed = getDriverFallbackSeed(driver.id);
          mapped.avatarUrl = getAvatarUriForSeed(fallbackSeed);
          mapped.avatarSeed = fallbackSeed;
        }

        if (mounted) setEntity(mapped);
      } catch (err) {
        if (mounted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load profile.";
          setErrorMessage(msg);
          setEntity(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [entityType, entityId, currentOrganization?.id]);

  return { entity, loading, errorMessage };
}
