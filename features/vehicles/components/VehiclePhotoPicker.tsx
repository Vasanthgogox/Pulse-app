import Feather from "@expo/vector-icons/Feather";
import { memo, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import Theme from "@/constants/Theme";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { formatIndianVehicleNumber } from "@/lib/format";

export type VehiclePhotoPickerProps = {
  vehicleNumber: string;
  avatarUrl?: string | null;
  size?: number;
  uploading?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export const VehiclePhotoPicker = memo(function VehiclePhotoPicker({
  vehicleNumber,
  avatarUrl,
  size = 80,
  uploading = false,
  onPress,
  style,
}: VehiclePhotoPickerProps) {
  const hasStoredPhoto = Boolean((avatarUrl ?? "").trim());
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const label = formatIndianVehicleNumber(vehicleNumber) || vehicleNumber.trim() || "Vehicle";

  useEffect(() => {
    setImageFailed(false);
    let cancelled = false;
    const raw = (avatarUrl ?? "").trim();
    if (!raw) {
      setResolvedUri(null);
      return () => {
        cancelled = true;
      };
    }
    if (/^https?:\/\//i.test(raw)) {
      setResolvedUri(raw);
      return () => {
        cancelled = true;
      };
    }
    void getSignedAvatarUrl(raw).then((signed) => {
      if (!cancelled) setResolvedUri(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  const showPhoto = hasStoredPhoto && resolvedUri && !imageFailed;
  const radius = Math.round(size / 2);

  return (
    <Pressable
      onPress={onPress}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={showPhoto ? "Change vehicle photo" : "Add vehicle photo"}
      style={({ pressed }) => [
        styles.wrap,
        { width: size, height: size },
        pressed && !uploading && styles.wrapPressed,
        style,
      ]}
    >
      {showPhoto ? (
        <Image
          source={{ uri: resolvedUri! }}
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: Theme.surface,
          }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            styles.empty,
            {
              width: size,
              height: size,
              borderRadius: radius,
            },
          ]}
        >
          <Feather name="camera" size={Math.round(size * 0.28)} color={Theme.primary} />
          <Text style={[styles.emptyLabel, { fontSize: Math.max(9, Math.round(size * 0.11)) }]}>
            Add photo
          </Text>
        </View>
      )}

      <View
        style={[
          styles.badge,
          {
            width: Math.round(size * 0.34),
            height: Math.round(size * 0.34),
            borderRadius: Math.round(size * 0.17),
            bottom: Math.round(size * 0.02),
            right: Math.round(size * 0.02),
          },
        ]}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={Theme.textOnPrimary} />
        ) : (
          <Feather
            name={showPhoto ? "edit-2" : "plus"}
            size={Math.round(size * 0.14)}
            color={Theme.textOnPrimary}
          />
        )}
      </View>

      {!showPhoto && !uploading ? (
        <Text style={styles.hint} numberOfLines={2}>
          Tap to add a photo for {label}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
  },
  wrapPressed: {
    opacity: 0.88,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Theme.primary,
  },
  emptyLabel: {
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  badge: {
    position: "absolute",
    backgroundColor: Theme.primary,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    top: "100%",
    marginTop: 6,
    width: 120,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 13,
  },
});
