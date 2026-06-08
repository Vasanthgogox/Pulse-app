import React from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { OrgAvatar, UserAvatar } from "@/components/Avatar";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";

export type ChatPartyAvatarProps = {
  identity: ResolvedPartyAvatarIdentity;
  size: number;
  /** Current viewer's own bubble — org logo in business context. */
  isOwnUser?: boolean;
  userAvatarUrl?: string | null;
  userAvatarSeed?: string | null;
  userOrgLogoUrl?: string | null;
  userOrgOwnerAvatarSeed?: string | null;
  userName?: string;
};

/**
 * Single chat avatar entry point — org logo → contact photo → seed → initials.
 * Used in sidebar rows, detail headers, and message bubbles across all chat tabs.
 */
export function ChatPartyAvatar({
  identity,
  size,
  isOwnUser = false,
  userAvatarUrl,
  userAvatarSeed,
  userOrgLogoUrl,
  userOrgOwnerAvatarSeed,
  userName,
}: ChatPartyAvatarProps) {
  if (isOwnUser) {
    return (
      <UserAvatar
        name={userName ?? identity.displayName}
        avatarUrl={userAvatarUrl ?? null}
        avatarSeed={userAvatarSeed ?? null}
        orgLogoUrl={userOrgLogoUrl ?? null}
        orgOwnerAvatarSeed={userOrgOwnerAvatarSeed ?? null}
        context="business"
        size={size}
      />
    );
  }

  const orgOnly =
    Boolean((identity.organizationImageUrl ?? "").trim()) ||
    Boolean((identity.organizationAvatarSeed ?? "").trim());

  if (orgOnly && !identity.avatarUrl && !identity.avatarSeed) {
    return (
      <OrgAvatar
        orgName={identity.displayName}
        logoUrl={identity.organizationImageUrl ?? null}
        ownerAvatarSeed={identity.organizationAvatarSeed ?? null}
        size={size}
        shape="circle"
      />
    );
  }

  return (
    <EntityAvatar
      name={identity.displayName}
      entityType={identity.entityType}
      size={size}
      avatarUrl={identity.avatarUrl ?? null}
      avatarSeed={identity.avatarSeed ?? null}
      organizationImageUrl={identity.organizationImageUrl ?? null}
      organizationAvatarSeed={identity.organizationAvatarSeed ?? null}
      showIntegrationBadge={false}
    />
  );
}
