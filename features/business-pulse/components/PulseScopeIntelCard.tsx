import { StyleSheet, Text, View } from "react-native";
import {
  Activity,
  Briefcase,
  Building2,
  Calendar,
  IndianRupee,
  MapPin,
  Route,
  Shield,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react-native";

import Theme from "@/constants/Theme";

export type PulseScopeIntelRow = {
  label: string;
  value: string;
};

type Props = {
  rows: PulseScopeIntelRow[];
};

function iconForLabel(label: string): LucideIcon {
  const key = label.toLowerCase();
  if (key.includes("period") || key.includes("date")) return Calendar;
  if (key.includes("workspace") || key.includes("branch")) return Building2;
  if (key.includes("client")) return Briefcase;
  if (key.includes("supplier") || key.includes("driver") || key.includes("member")) return Users;
  if (key.includes("vehicle") || key.includes("fleet")) return Truck;
  if (key.includes("revenue") || key.includes("margin") || key.includes("cash") || key.includes("cost"))
    return IndianRupee;
  if (key.includes("lane") || key.includes("route") || key.includes("trip")) return Route;
  if (key.includes("compliance") || key.includes("risk") || key.includes("doc")) return Shield;
  if (key.includes("execution") || key.includes("operation") || key.includes("utilization"))
    return Activity;
  if (key.includes("city") || key.includes("pickup")) return MapPin;
  return Activity;
}

/** Metronic key-value panel (About / Personal info style). */
export function PulseScopeIntelCard({ rows }: Props) {
  return (
    <View style={styles.wrap}>
      {rows.map((row, index) => {
        const Icon = iconForLabel(row.label);
        return (
          <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
            <View style={styles.labelCol}>
              <View style={styles.iconChip}>
                <Icon size={12} color={Theme.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.label}>{row.label}</Text>
            </View>
            <Text style={styles.value} numberOfLines={2}>
              {row.value}
            </Text>
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
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 7,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eff2f5",
  },
  labelCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  iconChip: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#f4f6fb",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  value: {
    flex: 1.15,
    fontSize: 12,
    fontWeight: "600",
    color: "#181C32",
    textAlign: "right",
  },
});
