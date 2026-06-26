/**
 * Load Center filter header — integrated party avatars + grow-network nudge.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import {
  LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT,
  LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT,
  LoadCenterNetworkGrowNudge,
} from "@/features/network/components/LoadCenterNetworkGrowNudge";
import Theme from "@/constants/Theme";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const MAX_VISIBLE = 4;
const FACE_SIZE = 28;

type Props = {
  mode: "supplier" | "client";
  parties: LoadCenterIntegratedParty[];
  onAddToNetwork: () => void;
  onPartyPress: (party: LoadCenterIntegratedParty) => void;
};

export function LoadCenterIntegratedPartiesRow({
  mode,
  parties,
  onAddToNetwork,
  onPartyPress,
}: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const trackHeight = compact
    ? LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT
    : LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT;
  const visible = parties.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, parties.length - MAX_VISIBLE);
  const overlap = 9;
  const nudgeMode = mode === "supplier" ? "give" : "get";

  const stackWidth = useMemo(() => {
    const slots = visible.length + (overflow > 0 ? 1 : 0);
    if (slots <= 0) return 0;
    return FACE_SIZE + Math.max(0, slots - 1) * (FACE_SIZE - overlap);
  }, [overflow, visible.length]);

  return (
    <View style={[styles.row, compact && styles.rowCompact, { minHeight: trackHeight }]}>
      {parties.length > 0 ? (
        <View
          style={[styles.stackWrap, { minWidth: stackWidth, height: trackHeight }]}
          accessibilityRole="toolbar"
          accessibilityLabel={
            mode === "supplier"
              ? `${parties.length} integrated suppliers`
              : `${parties.length} integrated clients`
          }
        >
          {visible.map((party, index) => (
            <Pressable
              key={party.id}
              onPress={() => onPartyPress(party)}
              style={({ pressed }) => [
                styles.faceSlot,
                index > 0 && { marginLeft: -overlap },
                { zIndex: index + 1 },
                pressed && styles.facePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={party.displayName}
              hitSlop={4}
            >
              <View style={styles.faceFrame}>
                <EntityAvatar
                  name={party.displayName}
                  entityType={party.entityType}
                  organizationImageUrl={party.organizationImageUrl}
                  organizationAvatarSeed={party.organizationAvatarSeed}
                  avatarUrl={party.avatarUrl}
                  avatarSeed={party.avatarSeed}
                  isIntegrated
                  size={FACE_SIZE}
                />
              </View>
            </Pressable>
          ))}
          {overflow > 0 ? (
            <Pressable
              onPress={onAddToNetwork}
              style={({ pressed }) => [
                styles.faceSlot,
                { marginLeft: -overlap, zIndex: MAX_VISIBLE + 1 },
                pressed && styles.facePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${overflow} more integrated ${mode === "supplier" ? "suppliers" : "clients"}`}
              hitSlop={4}
            >
              <View style={[styles.faceFrame, styles.overflowFrame]}>
                <Text style={styles.overflowText}>+{overflow}</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {parties.length > 0 ? (
        <View style={[styles.divider, { height: trackHeight - 6 }]} />
      ) : null}

      <LoadCenterNetworkGrowNudge
        mode={nudgeMode}
        onPress={onAddToNetwork}
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    flexShrink: 1,
    flex: 1,
  },
  rowCompact: {
    gap: 10,
    flexWrap: "wrap",
  },
  stackWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.loadStatusTabTrayBorder,
    flexShrink: 0,
    alignSelf: "center",
  },
  faceSlot: {
    width: FACE_SIZE + 2,
    height: FACE_SIZE + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  faceFrame: {
    borderRadius: (FACE_SIZE + 2) / 2,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    backgroundColor: Theme.cardWhite,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 4px rgba(77, 54, 54, 0.08)",
      },
      default: {
        shadowColor: "#4D3636",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  facePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  overflowFrame: {
    backgroundColor: Theme.loadAddButtonText,
    borderColor: Theme.cardWhite,
    width: FACE_SIZE + 2,
    height: FACE_SIZE + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  overflowText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: -0.2,
  },
});
