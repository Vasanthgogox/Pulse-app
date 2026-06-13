import Feather from "@expo/vector-icons/Feather";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";

import { ExpenseBillScanOverlay } from "./ExpenseBillScanOverlay";

type Props = {
  uri?: string | null;
  title?: string;
  emptyTitle?: string;
  hint?: string;
  emptyHint?: string;
  scanning?: boolean;
  busy?: boolean;
  scanLabel?: string;
  compact?: boolean;
  onAttach: () => void;
  onPress?: () => void;
  onRetake?: () => void;
  onRemove?: () => void;
};

/**
 * Fixed-height body photo slot for driver odometer / expense entry.
 * Shows preview when attached, or a camera affordance in the same layout when empty.
 */
export function OpsEntryBodyPhotoSlot({
  uri,
  title = "Attached photo",
  emptyTitle,
  hint = "Tap image to enlarge",
  emptyHint = "Photograph the bill to auto-fill fields",
  scanning = false,
  busy = false,
  scanLabel = "AI scan",
  compact = false,
  onAttach,
  onPress,
  onRetake,
  onRemove,
}: Props) {
  const hasPhoto = !!uri?.trim();
  const slotTitle = hasPhoto ? title : (emptyTitle ?? title);
  const slotHint = hasPhoto ? (scanning ? "Reading photo…" : hint) : emptyHint;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Feather
            name={hasPhoto ? "image" : "camera"}
            size={11}
            color={Theme.driverEmeraldDark}
          />
          <Text style={styles.title}>{slotTitle}</Text>
        </View>
        {hasPhoto ? (
          <View style={styles.actions}>
            {onRetake ? (
              <Pressable
                style={styles.actionBtn}
                onPress={onRetake}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
              >
                <Feather name="refresh-cw" size={10} color={Theme.driverEmeraldDark} />
                <Text style={styles.actionText}>Retake</Text>
              </Pressable>
            ) : null}
            {onRemove ? (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={onRemove}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Feather name="trash-2" size={10} color={Theme.destructive} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {hasPhoto ? (
        <Pressable
          style={[
            styles.previewWrap,
            compact && styles.previewWrapCompact,
            scanning && styles.previewWrapScanning,
          ]}
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole={onPress ? "button" : "image"}
          accessibilityLabel={onPress ? "View attached photo full screen" : slotTitle}
        >
          <Image source={{ uri: uri! }} style={styles.preview} resizeMode="cover" />
          <ExpenseBillScanOverlay visible={scanning} scanTravel={108} label={scanLabel} />
        </Pressable>
      ) : (
        <Pressable
          style={[styles.emptyWrap, compact && styles.previewWrapCompact, busy && styles.emptyWrapBusy]}
          onPress={onAttach}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Attach photo"
        >
          {busy ? (
            <>
              <ActivityIndicator color={Theme.driverEmeraldDark} size="small" />
              <Text style={styles.emptyBtnText}>{scanning ? "Scanning…" : "Working…"}</Text>
            </>
          ) : (
            <>
              <View style={styles.emptyIconRing}>
                <Feather name="camera" size={compact ? 20 : 24} color={Theme.driverEmeraldDark} />
              </View>
              <Text style={styles.emptyBtnText}>Attach photo</Text>
              <Text style={styles.emptySubtext}>Camera or gallery</Text>
            </>
          )}
        </Pressable>
      )}

      <Text style={styles.hint} numberOfLines={2}>
        {slotHint}
      </Text>
    </View>
  );
}

/** @deprecated Use OpsEntryBodyPhotoSlot — kept for callers that always have a uri. */
export function OpsEntryBodyPhotoPreview(
  props: Omit<Props, "onAttach"> & { uri: string; onAttach?: () => void },
) {
  return (
    <OpsEntryBodyPhotoSlot
      {...props}
      onAttach={props.onAttach ?? props.onRetake ?? (() => {})}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 8,
    gap: 6,
  },
  cardCompact: {
    padding: 6,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.headerTitle,
    fontSize: 9,
    letterSpacing: 0.55,
    color: Theme.textMuted,
    flexShrink: 1,
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(4,120,87,0.22)",
    backgroundColor: Theme.driverEmeraldMuted,
  },
  actionBtnDanger: {
    borderColor: "rgba(239,68,68,0.25)",
    backgroundColor: "rgba(254,226,226,0.5)",
    paddingHorizontal: 6,
  },
  actionText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.driverEmeraldDark,
  },
  previewWrap: {
    position: "relative",
    height: 132,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  previewWrapCompact: {
    height: 96,
    borderRadius: 8,
  },
  previewWrapScanning: {
    borderColor: "#6ee7b7",
    shadowColor: Theme.driverEmeraldDark,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  emptyWrap: {
    height: 132,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(4,120,87,0.28)",
    backgroundColor: Theme.driverEmeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  emptyWrapBusy: {
    borderStyle: "solid",
    borderColor: "rgba(4,120,87,0.18)",
  },
  emptyIconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(4,120,87,0.2)",
  },
  emptyBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.driverEmeraldDark,
    letterSpacing: 0.2,
  },
  emptySubtext: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  hint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 12,
  },
});
