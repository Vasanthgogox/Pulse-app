/**
 * Preset-sized wrapper around `EntityAvatar` for consistent entity identity across modules.
 */
import Theme from "@/constants/Theme";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { resolvedIdentityToEntityAvatarProps } from "@/lib/entityIdentity";
import { partyAvatarHasRenderableOutput } from "@/lib/partyAvatarDisplay";
import { shouldUseOfflinePartyRoleAvatar } from "@/lib/partyOfflineRoleAvatar";
import { StyleSheet, Text, View } from "react-native";
import { EntityAvatar } from "./EntityAvatar";

const SIZES = { sm: 24, md: 36, lg: 48 } as const;

export type EntityIdentitySize = keyof typeof SIZES;

export interface EntityIdentityAvatarProps {
  identity: ResolvedPartyAvatarIdentity;
  size?: EntityIdentitySize;
  showName?: boolean;
  showIntegrationBadge?: boolean;
}

export function EntityIdentityAvatar({
  identity,
  size = "md",
  showName = false,
  showIntegrationBadge = true,
}: EntityIdentityAvatarProps) {
  const px = SIZES[size];
  const props = resolvedIdentityToEntityAvatarProps(identity);
  const useOfflineRoleIcon = shouldUseOfflinePartyRoleAvatar(
    identity.isIntegrated,
    props.entityType ?? "client",
  );
  const showAvatar =
    useOfflineRoleIcon ||
    partyAvatarHasRenderableOutput({
      name: props.name,
      organizationImageUrl: props.organizationImageUrl,
      organizationAvatarSeed: props.organizationAvatarSeed,
      avatarUrl: props.avatarUrl,
      avatarSeed: props.avatarSeed,
      entityType: props.entityType,
    });

  if (!showAvatar && !showName) {
    return null;
  }

  return (
    <View style={[styles.row, showName && styles.rowWithName]}>
      {showAvatar ? (
        <EntityAvatar
          {...props}
          size={px}
          showIntegrationBadge={showIntegrationBadge}
        />
      ) : null}
      {showName ? (
        <Text style={styles.name} numberOfLines={1}>
          {identity.displayName}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "visible",
    flexShrink: 0,
  },
  rowWithName: {
    gap: 8,
    minWidth: 0,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
});
