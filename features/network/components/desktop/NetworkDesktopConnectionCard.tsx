/**
 * Your connections — Metronic user-directory tile (avatar + name + verified + handle).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { formatPartyContactPhone } from "@/features/network/utils/partyContactDisplay.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { BadgeCheck } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

function slugHandle(name: string, id: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  const tail = id.replace(/-/g, "").slice(0, 6);
  return `${base || "partner"}${tail}.pulse`;
}

type Props = {
  item: ConnectedOrg;
  onPress?: () => void;
};

export function NetworkDesktopConnectionCard({ item, onPress }: Props) {
  const entityType: PartyEntityType =
    item.role === "DRIVER" ? "driver" : item.role === "SUPPLIER" ? "supplier" : "client";
  const handle = item.phone
    ? formatPartyContactPhone(item.phone)
    : slugHandle(item.name, item.id);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
    >
      <View style={styles.avatarWrap}>
        <PartyAvatar
          name={item.name}
          entityType={entityType}
          avatarUrl={item.avatar_url}
          avatarSeed={item.avatar_seed}
          size={56}
          shape="circle"
        />
        {item.is_integrated ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {item.is_integrated ? (
          <BadgeCheck size={14} color={Theme.primary} strokeWidth={2.2} />
        ) : null}
      </View>
      <Text style={styles.handle} numberOfLines={1}>
        {handle}
      </Text>
      <Text style={styles.role} numberOfLines={1}>
        {item.role}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EFF2F5",
    backgroundColor: Theme.cardWhite,
    minHeight: 168,
    gap: 6,
    ...({
      boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.05)",
    } as object),
  },
  cardPressed: {
    opacity: 0.92,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    position: "relative",
    marginBottom: 4,
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#50CD89",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: "#181C32",
    flexShrink: 1,
  },
  handle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
    maxWidth: "100%",
    textAlign: "center",
  },
  role: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: "#78829D",
    marginTop: 2,
  },
});
