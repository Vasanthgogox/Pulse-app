import { StyleSheet, View } from "react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import type { PulsePartyProfile } from "@/features/business-pulse/lib/pulsePartyAvatars.util";

type Props = {
  party: PulsePartyProfile;
  size?: number;
};

/** Business Pulse party avatar — always visible, never flex-collapsed. */
export function PulsePartyAvatar({ party, size = 40 }: Props) {
  const seed = (party.avatarSeed ?? party.name ?? party.entityType).trim() || "party";
  const displayName = party.name?.trim() || "Party";

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <PartyAvatar
        name={displayName}
        avatarUrl={party.avatarUrl}
        avatarSeed={party.avatarSeed ?? seed}
        initialsColorSeed={seed}
        entityType={party.entityType}
        size={size}
        shape="circle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
