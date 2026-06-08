import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";

import { PulsePartyAvatar } from "@/features/business-pulse/components/PulsePartyAvatar";
import Theme from "@/constants/Theme";
import type { PulsePartyProfile } from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import { pulsePartyForName } from "@/features/business-pulse/lib/pulsePartyAvatars.util";

export type PulseContributorRow = {
  id: string;
  name: string;
  meta: string;
  selected?: boolean;
  party?: PulsePartyProfile;
};

type Props = {
  rows: PulseContributorRow[];
  onRowPress?: (id: string) => void;
  emptyMessage?: string;
};

export function PulseTopContributorsList({ rows, onRowPress, emptyMessage }: Props) {
  if (rows.length === 0) {
    return emptyMessage ? <Text style={styles.empty}>{emptyMessage}</Text> : null;
  }

  return (
    <View style={styles.wrap}>
      {rows.map((row, index) => {
        const party: PulsePartyProfile =
          row.party ?? {
            ...pulsePartyForName(row.name, "client"),
            avatarSeed: row.id,
          };

        const content = (
          <>
            <PulsePartyAvatar party={party} size={36} />
            <View style={styles.textCol}>
              <Text style={styles.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {row.meta}
              </Text>
            </View>
            <View style={styles.menu}>
              <MoreVertical size={16} color={Theme.textMuted} strokeWidth={2} />
            </View>
          </>
        );

        const rowStyle = [
          styles.row,
          index > 0 && styles.rowBorder,
          row.selected && styles.rowSelected,
        ];

        if (onRowPress) {
          return (
            <Pressable
              key={row.id}
              onPress={() => onRowPress(row.id)}
              style={({ pressed }) => [...rowStyle, pressed && styles.rowPressed]}
            >
              {content}
            </Pressable>
          );
        }

        return (
          <View key={row.id} style={rowStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 2,
    minHeight: 48,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eff2f5",
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowSelected: {
    backgroundColor: "#f4f6fa",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    color: "#181C32",
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  menu: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  empty: {
    fontSize: 12,
    color: "#A1A5B7",
    paddingVertical: 18,
    textAlign: "center",
  },
});
