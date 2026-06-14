import Feather from "@expo/vector-icons/Feather";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { ExpenseBillScanOverlay } from "@/features/trips/operations/shared/ExpenseBillScanOverlay";

import { OdometerScanBanner } from "./OdometerScanBanner";
import type { OdometerScanState } from "../odometerScan.types";

type Props = {
  uri?: string | null;
  fieldLabel: string;
  scanning?: boolean;
  busy?: boolean;
  scan: OdometerScanState;
  showBanner?: boolean;
  onAttach: () => void;
  onPressPreview?: () => void;
  onApplyPending?: () => void;
  onDismissPending?: () => void;
  onRescanPhoto?: () => void;
  onReviewOcr?: () => void;
};

/**
 * Compact body row: photo thumb + scan status on one line.
 */
export function OdometerBodyCaptureRow({
  uri,
  fieldLabel,
  scanning = false,
  busy = false,
  scan,
  showBanner = true,
  onAttach,
  onPressPreview,
  onApplyPending,
  onDismissPending,
  onRescanPhoto,
  onReviewOcr,
}: Props) {
  const hasPhoto = Boolean(uri?.trim());
  const scanActive = scanning || scan.phase === "preparing" || scan.phase === "analyzing";
  const bannerVisible =
    showBanner &&
    (hasPhoto || (scan.phase !== "idle" && scan.message.trim().length > 0));

  return (
    <View style={styles.row}>
      {hasPhoto ? (
        <Pressable
          style={[styles.thumb, scanActive && styles.thumbScanning]}
          onPress={onPressPreview}
          disabled={!onPressPreview}
          accessibilityRole="button"
          accessibilityLabel={`${fieldLabel} odometer photo`}
        >
          <Image source={{ uri: uri! }} style={styles.thumbImage} resizeMode="cover" />
          <ExpenseBillScanOverlay visible={scanActive} scanTravel={52} label="KM" />
        </Pressable>
      ) : (
        <Pressable
          style={[styles.thumb, styles.thumbEmpty]}
          onPress={onAttach}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Attach ${fieldLabel} photo`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={Theme.driverEmeraldDark} />
          ) : (
            <Feather name="camera" size={16} color={Theme.driverEmeraldDark} />
          )}
        </Pressable>
      )}

      {bannerVisible ? (
        <View style={styles.bannerSlot}>
          <OdometerScanBanner
            scan={
              scan.phase !== "idle" && scan.message.trim()
                ? scan
                : {
                    phase: "complete",
                    message: "Photo attached",
                    detectedKm: null,
                    appliedFields: [],
                    stepIndex: 3,
                  }
            }
            hasPhoto={hasPhoto}
            onApplyPending={onApplyPending}
            onDismissPending={onDismissPending}
            onRescanPhoto={onRescanPhoto}
            onReviewOcr={onReviewOcr}
          />
        </View>
      ) : (
        <Pressable
          style={styles.attachHint}
          onPress={onAttach}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.attachHintText}>Tap to photograph {fieldLabel.toLowerCase()} odometer</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    minHeight: 36,
  },
  thumb: {
    width: 52,
    height: 40,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    flexShrink: 0,
  },
  thumbScanning: {
    borderColor: "#6ee7b7",
  },
  thumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldMuted,
    borderStyle: "dashed",
    borderColor: "rgba(4,120,87,0.28)",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  bannerSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  attachHint: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 4,
    minWidth: 0,
  },
  attachHintText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
});
