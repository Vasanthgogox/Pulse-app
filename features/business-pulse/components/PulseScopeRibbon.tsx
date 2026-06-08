import { StyleSheet, Text, View } from "react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

type Props = {
  orgName: string;
  orgId?: string | null;
  orgLogoUrl?: string | null;
  tripCount: number;
  filterCount: number;
  domainLabel: string;
  wide: boolean;
};

export function PulseScopeRibbon({
  orgName,
  orgId,
  orgLogoUrl,
  tripCount,
  filterCount,
  domainLabel,
  wide,
}: Props) {
  const rowLayout = wide
    ? ({ flexDirection: "row" as const, alignItems: "center" as const })
    : ({ flexDirection: "column" as const, alignItems: "stretch" as const });

  return (
    <View style={[ent.surfaceCard, styles.wrap, rowLayout]}>
      <View style={styles.left}>
        <PartyAvatar
          name={orgName || "Workspace"}
          initialsColorSeed={orgId}
          organizationImageUrl={orgLogoUrl}
          size={36}
          shape="rounded"
        />
        <View style={styles.leftText}>
          <Text style={styles.title}>Live scope</Text>
          <Text style={styles.subtitle}>
            {tripCount} trips · {filterCount} filters
          </Text>
        </View>
      </View>
      <View style={styles.stats}>
        <View style={ent.statPill}>
          <Text style={ent.statPillValue}>{tripCount}</Text>
          <Text style={ent.statPillLabel}>Trips</Text>
        </View>
        <View style={ent.statPill}>
          <Text style={ent.statPillValue}>{filterCount}</Text>
          <Text style={ent.statPillLabel}>Filters</Text>
        </View>
        <View style={[ent.statPill, styles.domainPill]}>
          <Text style={[ent.statPillValue, styles.domainValue]}>
            {domainLabel.slice(0, 3).toUpperCase()}
          </Text>
          <Text style={ent.statPillLabel}>Domain</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    marginBottom: 10,
    justifyContent: "space-between",
    gap: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  leftText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#181C32",
    letterSpacing: -0.15,
  },
  subtitle: {
    fontSize: 11,
    color: "#A1A5B7",
    fontWeight: "500",
  },
  stats: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  domainPill: {
    minWidth: 64,
  },
  domainValue: {
    color: Theme.primary,
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
