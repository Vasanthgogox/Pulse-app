import { memo, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import Theme from "@/constants/Theme";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
} from "@/lib/partyAvatarDisplay";
import { formatIndianVehicleNumber } from "@/lib/format";

export type VehicleAvatarProps = {
  vehicleId: string;
  vehicleNumber: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

function vehiclePlateShortLabel(vehicleNumber: string): string {
  const norm = (vehicleNumber ?? "").replace(/\s/g, "");
  if (norm.length >= 4) return norm.slice(-4).toUpperCase();
  return partyInitialsFromName(formatIndianVehicleNumber(vehicleNumber) || vehicleNumber);
}

export const VehicleAvatar = memo(function VehicleAvatar({
  vehicleId,
  vehicleNumber,
  avatarUrl,
  avatarSeed,
  size = 32,
  style,
}: VehicleAvatarProps) {
  const displayNumber =
    formatIndianVehicleNumber(vehicleNumber) || vehicleNumber.trim() || "Vehicle";
  const seed = (avatarSeed ?? "").trim();
  const radius = Math.round(size * 0.28);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    let cancelled = false;

    const run = async () => {
      const raw = (avatarUrl ?? "").trim();
      if (raw) {
        if (/^https?:\/\//i.test(raw)) {
          if (!cancelled) setResolvedUri(raw);
          return;
        }
        const signed = await getSignedAvatarUrl(raw);
        if (!cancelled) setResolvedUri(signed);
        return;
      }
      if (seed) {
        if (!cancelled) setResolvedUri(getUser2DAvatarUriForSeed(seed));
        return;
      }
      if (!cancelled) setResolvedUri(null);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [avatarUrl, seed]);

  if (resolvedUri && !imageFailed) {
    return (
      <View style={[{ width: size, height: size }, style]}>
        <Image
          source={{ uri: resolvedUri }}
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: Theme.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: Theme.borderLight,
          }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  const bg = partyAvatarBackgroundColor(vehicleId);
  const label = vehiclePlateShortLabel(displayNumber);
  return (
    <View
      style={[
        styles.plate,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.plateText,
          {
            fontSize: Math.max(8, Math.round(size * 0.28)),
            color: partyAvatarInitialsTextColor(bg),
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  plate: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  plateText: {
    fontWeight: "800",
    letterSpacing: 0.3,
    fontVariant: ["tabular-nums"],
  },
});
