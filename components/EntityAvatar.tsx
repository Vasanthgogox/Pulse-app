/**
 * Shared avatar for Customers, Suppliers, Drivers list rows.
 * Adapts the legacy flat-prop API to `<PartyAvatar>` (typed party system).
 * Integration status: small badge dot (green = integrated, grey = manual).
 */
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { AvatarParty } from "@/lib/useAvatar";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export interface EntityAvatarProps {
  name: string;
  avatarUrl?: string | null;
  /** @deprecated Seeds are ignored — initials are shown instead of preset images. */
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  /** @deprecated Seeds are ignored in the new avatar system. */
  organizationAvatarSeed?: string | null;
  /** @deprecated Use `style` instead. Kept for back-compat. */
  borderStyle?: StyleProp<ViewStyle>;
  /** @deprecated Initials color is derived from name. */
  initialsColorSeed?: string | null;
  /** Determines which party type to use for avatar resolution. */
  entityType?: PartyEntityType;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** When true, shows a green connected dot; grey dot otherwise. */
  isIntegrated?: boolean;
  /** Hide the integration badge (e.g. dense lists / hero). */
  showIntegrationBadge?: boolean;
}

function buildParty(props: {
  name: string;
  avatarUrl?: string | null;
  organizationImageUrl?: string | null;
  entityType?: PartyEntityType;
}): AvatarParty {
  const { name, avatarUrl, organizationImageUrl, entityType } = props;

  if (entityType === "driver") {
    return { type: "driver", name, avatarUrl };
  }

  if (organizationImageUrl) {
    return { type: "organization", name, logoUrl: organizationImageUrl };
  }

  return { type: "user", name, avatarUrl };
}

export function EntityAvatar({
  name,
  avatarUrl,
  avatarSeed: _avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed: _organizationAvatarSeed,
  borderStyle,
  initialsColorSeed: _initialsColorSeed,
  entityType = "client",
  size = 36,
  style,
  isIntegrated = false,
  showIntegrationBadge = true,
}: EntityAvatarProps) {
  const badgeSize = Math.round(size * 0.28);
  const badgeOffset = Math.round(size * 0.02);

  const party = buildParty({ name, avatarUrl, organizationImageUrl, entityType });

  const avatar = (
    <PartyAvatar
      party={party}
      size={size}
      shape={entityType === "driver" ? "circle" : "rounded"}
      style={style ?? borderStyle}
    />
  );

  if (!showIntegrationBadge) {
    return <View style={{ width: size, height: size }}>{avatar}</View>;
  }

  return (
    <View style={{ width: size, height: size }}>
      {avatar}
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            bottom: badgeOffset,
            right: badgeOffset,
            backgroundColor: isIntegrated ? Theme.darkGreen : Theme.iconSlate,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});
