import React, { useEffect, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Building2, Truck, User } from "lucide-react-native";
import Theme from "@/constants/Theme";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
  resolvePartyDisplayUri,
  resolvePartyPhotoUriAsync,
  type PartyEntityType,
} from "@/lib/partyAvatarDisplay";
import {
  offlinePartyRoleIconSize,
  offlinePartyRolePresentation,
  shouldUseOfflinePartyRoleAvatar,
} from "@/lib/partyOfflineRoleAvatar";

export type { PartyEntityType } from "@/lib/partyAvatarDisplay";
export type PartyAvatarShape = "circle" | "rounded" | "square";

function partyAvatarRadius(size: number, shape: PartyAvatarShape): number {
  if (shape === "circle") return size / 2;
  if (shape === "rounded") return Math.round(size * 0.26);
  return 4;
}

/** Logos and client/supplier marks should letterbox; driver photos may crop. */
function partyAvatarImageResizeMode(
  entityType: PartyEntityType,
  organizationImageUrl?: string | null,
): "contain" | "cover" {
  if ((organizationImageUrl ?? "").trim()) return "contain";
  if (entityType === "client" || entityType === "supplier") return "contain";
  return "cover";
}

export type PartyAvatarProps = {
  name: string;
  /** When set, initials fallback background is hashed from this (e.g. org id) so renames do not change color. */
  initialsColorSeed?: string | null;
  /** Linked org / org branding photo (storage path or http). */
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
  /** When `false`, role entities show role icon plates (offline party state). */
  isIntegrated?: boolean;
  size: number;
  /** `rounded` matches attribution / shipper picker tiles (not full circle). */
  shape?: PartyAvatarShape;
  style?: StyleProp<ViewStyle>;
  borderStyle?: StyleProp<ImageStyle>;
};

/**
 * One place for party visuals: org logo → contact photo → seed preset → initials (cash tab style).
 */
export function PartyAvatar({
  name,
  initialsColorSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  avatarUrl,
  avatarSeed,
  entityType = "client",
  isIntegrated,
  size,
  shape = "circle",
  style,
  borderStyle,
}: PartyAvatarProps) {
  const radius = partyAvatarRadius(size, shape);

  if (shouldUseOfflinePartyRoleAvatar(isIntegrated, entityType)) {
    const roleType = entityType as "client" | "supplier" | "driver" | "vehicle";
    const { accent, iconColor, accessibilityLabel } = offlinePartyRolePresentation(roleType);
    const Icon =
      roleType === "supplier" || roleType === "vehicle"
        ? Truck
        : roleType === "driver"
          ? User
          : Building2;
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.offlineRoleWrap,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: accent.tint,
            borderColor: accent.ring,
          },
          style,
        ]}
      >
        <Icon
          size={offlinePartyRoleIconSize(size)}
          color={iconColor}
          strokeWidth={2.2}
        />
      </View>
    );
  }

  const [resolvedPhotoUri, setResolvedPhotoUri] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const hasRawPhotoField = Boolean(
    (organizationImageUrl ?? "").trim() || (avatarUrl ?? "").trim(),
  );

  useEffect(() => {
    setImageFailed(false);
  }, [organizationImageUrl, avatarUrl, avatarSeed, organizationAvatarSeed, entityType, name]);

  useEffect(() => {
    let cancelled = false;
    if (!hasRawPhotoField) {
      setResolvedPhotoUri(null);
      return () => {
        cancelled = true;
      };
    }
    resolvePartyPhotoUriAsync({
      organizationImageUrl,
      avatarUrl,
    }).then((uri) => {
      if (!cancelled) setResolvedPhotoUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRawPhotoField, organizationImageUrl, avatarUrl]);

  const awaitingSignedPhoto =
    hasRawPhotoField && resolvedPhotoUri == null;
  const syncUri = awaitingSignedPhoto
    ? null
    : resolvePartyDisplayUri({
        organizationImageUrl,
        organizationAvatarSeed,
        avatarUrl,
        avatarSeed,
        entityType,
      });
  const uri = resolvedPhotoUri ?? syncUri;
  const displayName = (name ?? "").trim() || "Party";
  const colorSeed = (initialsColorSeed ?? avatarSeed ?? "").trim() || displayName;
  const initials = partyInitialsFromName(displayName);
  const bg = partyAvatarBackgroundColor(colorSeed);
  const initialsColor = partyAvatarInitialsTextColor(bg);

  if (uri && !imageFailed) {
    const resizeMode = partyAvatarImageResizeMode(entityType, organizationImageUrl);
    return (
      <View
        style={[
          styles.photoFrame,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
          style,
        ]}
      >
        <Image
          source={{ uri }}
          resizeMode={resizeMode}
          accessibilityIgnoresInvertColors
          onError={() => setImageFailed(true)}
          style={[
            styles.photoImage,
            {
              width: size,
              height: size,
              borderRadius: radius,
            },
            Platform.OS === "web" ? { objectFit: resizeMode } : null,
            borderStyle,
          ]}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.initialsWrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: Theme.border,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initialsText,
          {
            fontSize: size * 0.3,
            lineHeight: size * 0.36,
            color: initialsColor,
          },
        ]}
        numberOfLines={1}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offlineRoleWrap: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
    overflow: "hidden",
  },
  photoFrame: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  photoImage: {
    flexShrink: 0,
  },
  initialsWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  initialsText: {
    fontWeight: "400",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
