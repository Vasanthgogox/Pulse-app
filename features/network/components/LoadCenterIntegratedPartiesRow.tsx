/**
 * Load Center filter header — integrated party avatars.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { useMemo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const MAX_VISIBLE = 4;
const FACE_SIZE = 30;
const RING_SIZE = FACE_SIZE + 2;
/** Ring + white halo — kept inside the shared track so dots don’t drop the stack. */
const SLOT_SIZE = RING_SIZE + 2;
const TRACK_HEIGHT = 42;
const TRACK_HEIGHT_COMPACT = 38;

type Props = {
  mode: "supplier" | "client";
  parties: LoadCenterIntegratedParty[];
  onAddToNetwork: () => void;
  onPartyPress: (party: LoadCenterIntegratedParty) => void;
};

function PartyFaceSlot({
  slotSize,
  children,
}: {
  slotSize: number;
  children: ReactNode;
}) {
  return (
    <View style={[styles.faceSlot, { width: slotSize, height: slotSize }]}>
      <View style={styles.faceRing}>{children}</View>
      <View style={styles.integratedDot} />
    </View>
  );
}

export function LoadCenterIntegratedPartiesRow({
  mode,
  parties,
  onAddToNetwork,
  onPartyPress,
}: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const trackHeight = compact ? TRACK_HEIGHT_COMPACT : TRACK_HEIGHT;
  const visible = parties.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, parties.length - MAX_VISIBLE);
  const overlap = 10;
  const slotSize = Math.min(SLOT_SIZE, trackHeight);

  const stackWidth = useMemo(() => {
    const slots = visible.length + (overflow > 0 ? 1 : 0);
    if (slots <= 0) return 0;
    return slotSize + Math.max(0, slots - 1) * (slotSize - overlap);
  }, [overflow, slotSize, visible.length]);

  if (parties.length === 0) return null;

  return (
    <View
      style={[
        styles.row,
        compact && styles.rowCompact,
        { height: trackHeight, minHeight: trackHeight },
      ]}
    >
      <View
        style={[
          styles.stackWrap,
          { minWidth: stackWidth, height: trackHeight },
        ]}
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
              styles.facePressable,
              { width: slotSize, height: trackHeight },
              index > 0 && { marginLeft: -overlap },
              { zIndex: index + 1 },
              pressed && styles.facePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={party.displayName}
            hitSlop={4}
          >
            <PartyFaceSlot slotSize={slotSize}>
              <EntityAvatar
                name={party.displayName}
                entityType={party.entityType}
                organizationImageUrl={party.organizationImageUrl}
                organizationAvatarSeed={party.organizationAvatarSeed}
                avatarUrl={party.avatarUrl}
                avatarSeed={party.avatarSeed}
                isIntegrated
                size={FACE_SIZE}
                showIntegrationBadge={false}
              />
            </PartyFaceSlot>
          </Pressable>
        ))}
        {overflow > 0 ? (
          <Pressable
            onPress={onAddToNetwork}
            style={({ pressed }) => [
              styles.facePressable,
              { width: slotSize, height: trackHeight },
              { marginLeft: -overlap, zIndex: MAX_VISIBLE + 1 },
              pressed && styles.facePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${overflow} more integrated ${mode === "supplier" ? "suppliers" : "clients"}`}
            hitSlop={4}
          >
            <View style={[styles.faceSlot, { width: slotSize, height: slotSize }]}>
              <View style={[styles.faceRing, styles.overflowFrame]}>
                <Text style={styles.overflowText}>+{overflow}</Text>
              </View>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minWidth: 0,
    flexShrink: 1,
  },
  rowCompact: {
    gap: 11,
  },
  stackWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  facePressable: {
    alignItems: "center",
    justifyContent: "center",
  },
  faceSlot: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  faceRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  integratedDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.positive,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 2,
  },
  facePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  overflowFrame: {
    backgroundColor: Theme.loadAddButtonText,
    borderColor: Theme.cardWhite,
  },
  overflowText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: -0.2,
  },
});
