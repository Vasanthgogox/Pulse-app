import { StyleSheet, Text, View } from "react-native";

import { PulsePartyAvatar } from "@/features/business-pulse/components/PulsePartyAvatar";
import type { PulsePartyProfile } from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import { pulsePartyForName } from "@/features/business-pulse/lib/pulsePartyAvatars.util";

type PulsePartyCellProps = {
  party: PulsePartyProfile;
  meta?: string | null;
  avatarSize?: number;
};

/** Metronic Member column — circular avatar + bold name + gray subline. */
export function PulsePartyCell({ party, meta, avatarSize = 36 }: PulsePartyCellProps) {
  const resolved: PulsePartyProfile =
    party.name?.trim()
      ? party
      : pulsePartyForName("Party", party.entityType);

  return (
    <View style={styles.row}>
      <PulsePartyAvatar party={resolved} size={avatarSize} />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {resolved.name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    color: "#181C32",
    letterSpacing: -0.05,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
  },
});
