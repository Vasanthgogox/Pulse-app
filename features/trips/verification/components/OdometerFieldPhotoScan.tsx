import Feather from "@expo/vector-icons/Feather";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

import type { OdometerScanState } from "../odometerScan.types";

type Props = {
  fieldLabel: string;
  uri?: string | null;
  scan: OdometerScanState;
  scanning?: boolean;
  busy?: boolean;
  onAttach: () => void;
  onPressPreview?: () => void;
  onRetake?: () => void;
  onRemove?: () => void;
  onRescanPhoto?: () => void;
  onApplyPending?: () => void;
  onDismissPending?: () => void;
  onReviewOcr?: () => void;
};

export function OdometerFieldPhotoScan({
  fieldLabel,
  uri,
  scan,
  scanning = false,
  busy = false,
  onAttach,
  onPressPreview,
  onRetake,
  onRemove,
  onRescanPhoto,
  onApplyPending,
  onDismissPending,
  onReviewOcr,
}: Props) {
  const hasPhoto = Boolean(uri?.trim());
  const isAnalyzing = scanning || scan.phase === "preparing" || scan.phase === "analyzing";
  const isConfirm = scan.phase === "confirm";
  const isError = scan.phase === "error";
  const detectedKm = scan.detectedKm?.trim() || null;
  const hasPendingApply = Boolean(scan.pendingKm?.trim()) && (isConfirm || scan.phase === "complete");

  const accent = isError ? Theme.warning : isConfirm ? Theme.primary : Theme.driverEmeraldDark;

  const statusTitle = isAnalyzing
    ? "Reading…"
    : hasPendingApply && scan.pendingKm
      ? `Apply ${scan.pendingKm} KM?`
      : detectedKm
        ? `${detectedKm} KM`
        : isError
          ? "Scan failed"
          : hasPhoto
            ? "Photo ready"
            : "Add photo";

  const statusHint = isAnalyzing
    ? scan.message
    : hasPendingApply
      ? "OCR differs from keypad"
      : detectedKm && scan.appliedFields?.includes("KM reading")
        ? "Applied from OCR"
        : detectedKm
          ? "OCR reading"
          : isError
            ? scan.message
            : hasPhoto
              ? "Tap re-scan to read KM"
              : "Camera or gallery";

  return (
    <View style={styles.card}>
      {hasPhoto ? (
        <Pressable
          style={[styles.thumb, isAnalyzing && styles.thumbScanning]}
          onPress={onPressPreview}
          disabled={!onPressPreview || busy}
          accessibilityRole={onPressPreview ? "button" : "image"}
          accessibilityLabel={`${fieldLabel} odometer photo`}
        >
          <Image source={{ uri: uri! }} style={styles.thumbImage} resizeMode="cover" />
          {isAnalyzing ? (
            <View style={styles.thumbOverlay}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : null}
        </Pressable>
      ) : (
        <Pressable
          style={styles.thumbEmpty}
          onPress={onAttach}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Attach ${fieldLabel} odometer photo`}
        >
          {busy ? (
            <ActivityIndicator color={Theme.driverEmeraldDark} size="small" />
          ) : (
            <Feather name="camera" size={22} color={Theme.driverEmeraldDark} />
          )}
        </Pressable>
      )}

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.fieldLabel}>{fieldLabel}</Text>
          {scan.processingSec != null && scan.processingSec > 0 && !isAnalyzing ? (
            <Text style={styles.timing}>{scan.processingSec.toFixed(1)}s</Text>
          ) : null}
        </View>
        <Text style={[styles.statusTitle, detectedKm && styles.statusTitleKm]} numberOfLines={1}>
          {statusTitle}
        </Text>
        <Text style={styles.statusHint} numberOfLines={1}>
          {statusHint}
        </Text>
      </View>

      <View style={styles.actions}>
        {hasPendingApply ? (
          <>
            <Pressable
              style={[styles.iconBtn, styles.iconBtnPrimary, { backgroundColor: accent }]}
              onPress={() => onApplyPending?.()}
              accessibilityRole="button"
              accessibilityLabel="Apply OCR reading"
            >
              <Feather name="check" size={14} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onDismissPending?.()}
              accessibilityRole="button"
              accessibilityLabel="Keep current reading"
            >
              <Feather name="x" size={14} color={Theme.textMuted} />
            </Pressable>
          </>
        ) : null}

        {!hasPendingApply && hasPhoto && onRescanPhoto ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onRescanPhoto()}
            disabled={busy || isAnalyzing}
            accessibilityRole="button"
            accessibilityLabel="Re-scan photo"
          >
            <Feather name="refresh-cw" size={14} color={accent} />
          </Pressable>
        ) : null}

        {!hasPendingApply && detectedKm && onReviewOcr ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onReviewOcr()}
            accessibilityRole="button"
            accessibilityLabel="Review OCR reading"
          >
            <Feather name="edit-3" size={14} color={accent} />
          </Pressable>
        ) : null}

        {hasPhoto && onRetake ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onRetake()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Retake photo"
          >
            <Feather name="camera" size={14} color={Theme.textSecondary} />
          </Pressable>
        ) : null}

        {hasPhoto && onRemove ? (
          <Pressable
            style={[styles.iconBtn, styles.iconBtnDanger]}
            onPress={() => onRemove()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
          >
            <Feather name="trash-2" size={13} color={Theme.destructive} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  thumb: {
    width: 76,
    height: 58,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexShrink: 0,
  },
  thumbScanning: {
    borderColor: "#6ee7b7",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmpty: {
    width: 76,
    height: 58,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(4,120,87,0.28)",
    backgroundColor: Theme.driverEmeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  timing: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  statusTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.driverEmeraldDark,
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  statusTitleKm: {
    fontSize: 17,
    textTransform: "none",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  statusHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPrimary: {
    borderWidth: 0,
  },
  iconBtnDanger: {
    borderColor: "rgba(239,68,68,0.22)",
    backgroundColor: "rgba(254,226,226,0.45)",
  },
});
