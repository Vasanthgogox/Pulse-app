import Theme from "@/constants/Theme";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type { PartyEntityAccent } from "@/lib/partyEntityAccent";

/** Offline client/supplier tile — golden fill + ink icon (reference asset). */
const OFFLINE_PARTY_ACCENT: PartyEntityAccent = {
  ring: Theme.brandBlueInk,
  glow: Theme.accentGoldMuted,
  glowCore: Theme.accentGoldMuted,
  tint: Theme.accentGold,
};

/** True when we should show a role icon plate instead of photo / seed / initials. */
export function shouldUseOfflinePartyRoleAvatar(
  isIntegrated: boolean | undefined,
  entityType: PartyEntityType,
): boolean {
  return (
    isIntegrated === false &&
    (entityType === "client" || entityType === "supplier")
  );
}

export function offlinePartyRoleIconSize(avatarSize: number): number {
  return Math.max(14, Math.round(avatarSize * 0.44));
}

export function offlinePartyRolePresentation(entityType: "client" | "supplier") {
  return {
    accent: OFFLINE_PARTY_ACCENT,
    iconColor: Theme.brandBlueInk,
    accessibilityLabel: entityType === "supplier" ? "Supplier" : "Client",
  };
}
