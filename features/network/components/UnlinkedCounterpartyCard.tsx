import Theme from "@/constants/Theme";
import { Building2, Truck } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { UnlinkedCounterparty } from "@/features/network/services/counterparties.service";

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

type Props = {
  item: UnlinkedCounterparty;
  onConnectPress: (item: UnlinkedCounterparty) => void;
};

export function UnlinkedCounterpartyCard({ item, onConnectPress }: Props) {
  const isSupplier = item.counterparty_type === "supplier";
  const TypeIcon = isSupplier ? Truck : Building2;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <TypeIcon
          size={16}
          color={isSupplier ? Theme.primary : Theme.textPrimaryDark}
          strokeWidth={2}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {item.counterparty_name}
        </Text>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.typePill,
              isSupplier ? styles.typePillSupplier : styles.typePillClient,
            ]}
          >
            <Text
              style={[
                styles.typePillText,
                isSupplier
                  ? styles.typePillTextSupplier
                  : styles.typePillTextClient,
              ]}
            >
              {isSupplier ? "SUPPLIER" : "CLIENT"}
            </Text>
          </View>
          <Text style={styles.tripCount}>
            {item.trip_count} {item.trip_count === 1 ? "trip" : "trips"}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.lastDate}>
            {formatRelativeDate(item.last_trip_date)}
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.connectBtn,
          pressed && styles.connectBtnPressed,
        ]}
        onPress={() => onConnectPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`Connect with ${item.counterparty_name}`}
      >
        <Text style={styles.connectBtnText}>Connect</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  typePill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  typePillSupplier: {
    backgroundColor: Theme.networkHubListCardPrimaryTintBg,
    borderColor: Theme.networkHubListCardPrimaryTintBorder,
  },
  typePillClient: {
    backgroundColor: Theme.networkClientTintBg,
    borderColor: "rgba(79,70,229,0.2)",
  },
  typePillText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  typePillTextSupplier: {
    color: Theme.primary,
  },
  typePillTextClient: {
    color: Theme.primary,
  },
  tripCount: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  dot: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  lastDate: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    flexShrink: 1,
  },
  connectBtn: {
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  connectBtnPressed: {
    opacity: 0.82,
  },
  connectBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
