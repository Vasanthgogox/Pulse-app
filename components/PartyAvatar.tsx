import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import Theme from "@/constants/Theme";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyAvatarHasRenderableOutput,
  partyInitialsFromName,
  resolvePartyDisplayUri,
  resolvePartyPhotoUriAsync,
  type PartyEntityType,
} from "@/lib/partyAvatarDisplay";

export type PartyAvatarProps = {
  name: string;
  /** Linked org / org branding photo (storage path or http). */
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
  size: number;
  style?: StyleProp<ViewStyle>;
  borderStyle?: StyleProp<ImageStyle>;
};

/**
 * One place for party visuals: org logo → contact photo → seed preset → initials (cash tab style).
 */
export function PartyAvatar({
  name,
  organizationImageUrl,
  organizationAvatarSeed,
  avatarUrl,
  avatarSeed,
  entityType = "client",
  size,
  style,
  borderStyle,
}: PartyAvatarProps) {
  const [resolvedPhotoUri, setResolvedPhotoUri] = useState<string | null>(null);
  const hasRawPhotoField = Boolean(
    (organizationImageUrl ?? "").trim() || (avatarUrl ?? "").trim(),
  );

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

  const syncUri = resolvePartyDisplayUri({
    organizationImageUrl,
    organizationAvatarSeed,
    avatarUrl,
    avatarSeed,
    entityType,
  });
  const uri = resolvedPhotoUri ?? syncUri;
  if (
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
  const initials = partyInitialsFromName(name);
  const bg = partyAvatarBackgroundColor(name);
  const initialsColor = partyAvatarInitialsTextColor(bg);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
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
          borderRadius: size / 2,
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
