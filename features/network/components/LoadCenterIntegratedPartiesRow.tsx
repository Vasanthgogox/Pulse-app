/**
 * Load Center filter header — integrated supplier (Give) / client (Get) avatars,
 * or a CTA to add parties on the Network tab when none exist.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
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
  const visible = parties.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, parties.length - MAX_VISIBLE);
  const overlap = 9;

  const stackWidth = useMemo(() => {
    const slots = visible.length + (overflow > 0 ? 1 : 0);
    if (slots <= 0) return 0;
    return FACE_SIZE + Math.max(0, slots - 1) * (FACE_SIZE - overlap);
  }, [overflow, visible.length]);

  if (parties.length === 0) {
    return null;
  }

  return (
    <View
      style={[styles.stackWrap, { minWidth: stackWidth }]}
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
  );
}

const styles = StyleSheet.create({
  stackWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: FACE_SIZE + 4,
    flexShrink: 0,
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
  },
  facePressed: {
    opacity: 0.88,
  },
  overflowFrame: {
    backgroundColor: Theme.textPrimaryDark,
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
