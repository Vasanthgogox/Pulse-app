import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import Theme from "@/constants/Theme";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
  resolvePartyDisplayUri,
  resolvePartyPhotoUriAsync,
  type PartyEntityType,
} from "@/lib/partyAvatarDisplay";

export type { PartyEntityType } from "@/lib/partyAvatarDisplay";
export type PartyAvatarShape = "circle" | "rounded" | "square";

function partyAvatarRadius(size: number, shape: PartyAvatarShape): number {
  if (shape === "circle") return size / 2;
  if (shape === "rounded") return Math.round(size * 0.26);
  return 4;
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
  size,
  shape = "circle",
  style,
  borderStyle,
}: PartyAvatarProps) {
  const radius = partyAvatarRadius(size, shape);
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
    return (
      <Image
        source={{ uri }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        onError={() => setImageFailed(true)}
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: Theme.surface,
            borderWidth: 1,
            borderColor: Theme.border,
            overflow: "hidden",
          },
          borderStyle,
          style as StyleProp<ImageStyle>,
        ]}
      />
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
  initialsWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontWeight: "400",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
