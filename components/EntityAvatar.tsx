/**
 * Shared avatar for Customers, Suppliers, Drivers list rows.
 * Delegates to `PartyAvatar`: linked-org logo → contact photo → seed preset → initials.
 * Integration status: small badge dot (green = integrated, grey = manual).
 */
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { partyAvatarHasRenderableOutput } from "@/lib/partyAvatarDisplay";
import { shouldUseOfflinePartyRoleAvatar } from "@/lib/partyOfflineRoleAvatar";
import { StyleSheet, View } from "react-native";

export interface EntityAvatarProps {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  /** Determines which seed generator to use for preset fallback. */
  entityType?: PartyEntityType;
  size?: number;
  /** When true, shows a green connected dot; grey dot otherwise. */
  isIntegrated?: boolean;
  /** Hide the integration badge (e.g. dense lists / hero). */
  showIntegrationBadge?: boolean;
}

export function EntityAvatar({
  name,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  entityType = "client",
  size = 36,
  isIntegrated = false,
  showIntegrationBadge = true,
}: EntityAvatarProps) {
  const badgeSize = Math.max(8, Math.round(size * 0.28));
  /** Reserve space so the status dot sits outside the avatar ring (no border overlap). */
  const badgeGutter = badgeSize;
  const frame = size + badgeGutter;

  const useOfflineRoleIcon = shouldUseOfflinePartyRoleAvatar(
    isIntegrated,
    entityType,
  );

  if (
    !useOfflineRoleIcon &&
    !partyAvatarHasRenderableOutput({
      name,
      organizationImageUrl,
      organizationAvatarSeed,
      avatarUrl,
      avatarSeed,
      entityType,
    })
  ) {
    return null;
  }

  const avatar = (
    <PartyAvatar
      name={name}
      organizationImageUrl={organizationImageUrl}
      organizationAvatarSeed={organizationAvatarSeed}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      entityType={entityType}
      isIntegrated={isIntegrated}
      size={size}
    />
  );

  if (!showIntegrationBadge) {
    return (
      <View style={[styles.frame, { width: size, height: size }]}>{avatar}</View>
    );
  }

  return (
    <View style={[styles.frame, { width: frame, height: frame }]}>
      <View style={[styles.avatarAnchor, { width: size, height: size }]}>{avatar}</View>
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: isIntegrated ? Theme.darkGreen : Theme.iconSlate,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    flexShrink: 0,
  },
  avatarAnchor: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 2,
  },
});
