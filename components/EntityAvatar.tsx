/**
 * Shared avatar component for Customers, Suppliers, and Drivers list rows.
 * Priority: profile photo (public storage) → preset avatar (seed) → initials circle.
 * Integration status shown as a small badge dot (green = integrated, grey = manual).
 *
 * Zero async calls — resolveAvatarPublicUrl is synchronous since the bucket is public.
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import Theme from "@/constants/Theme";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import { Image, StyleSheet, Text, View } from "react-native";

const AVATAR_COLORS = [
  Theme.primary,
  Theme.primaryLight,
  Theme.aggregatePillText,
  Theme.darkGreen,
  Theme.teslaRed,
  Theme.textPrimary,
  Theme.buttonSecondary,
  Theme.integratedIcon,
  Theme.iconSlate,
  Theme.primaryText,
];

function avatarBgColor(str: string): string {
  let n = 0;
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length] ?? Theme.primary;
}

function nameInitials(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "?";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2)
    return ((words[0]![0] ?? "") + (words[words.length - 1]![0] ?? "")).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

export interface EntityAvatarProps {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  /** Determines which seed generator to use for preset fallback. */
  entityType?: "client" | "supplier" | "driver";
  size?: number;
  /** When true, shows a green connected dot; grey dot otherwise. */
  isIntegrated?: boolean;
}

export function EntityAvatar({
  name,
  avatarUrl,
  avatarSeed,
  entityType = "client",
  size = 36,
  isIntegrated = false,
}: EntityAvatarProps) {
  // 1. Profile photo from storage (synchronous public URL)
  const photoUri = resolveAvatarPublicUrl(avatarUrl);

  // 2. Preset avatar from seed (CDN URL, synchronous)
  const seedUri =
    !photoUri && avatarSeed
      ? entityType === "driver"
        ? getAvatarUriForSeed(avatarSeed)
        : getUser2DAvatarUriForSeed(avatarSeed)
      : null;

  const imageUri = photoUri ?? seedUri;
  const radius = size / 2;
  const badgeSize = Math.round(size * 0.28);
  const badgeOffset = Math.round(size * 0.02);

  return (
    <View style={{ width: size, height: size }}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.initialsCircle,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: avatarBgColor(name),
            },
          ]}
        >
          <Text
            style={[styles.initialsText, { fontSize: Math.round(size * 0.35) }]}
            numberOfLines={1}
          >
            {nameInitials(name)}
          </Text>
        </View>
      )}
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
  initialsCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  badge: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});
