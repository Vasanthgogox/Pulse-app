import { PartyAvatar } from "@/components/PartyAvatar";
import type { JobCardAssignerPayload } from "@/features/trips/utils/driverAssignerDisplay.util";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  assigner: JobCardAssignerPayload | null;
  fallback?: string;
  mutedColor: string;
  textColor: string;
  /** Compact row for trip list cards (default). */
  compact?: boolean;
};

export function TripListAssignerRow({
  assigner,
  fallback = "Fleet dispatcher",
  mutedColor,
  textColor,
  compact = true,
}: Props) {
  const primary = assigner?.linePrimary.trim() ?? "";
  const secondary = assigner?.lineSecondary.trim() ?? "";
  const hasLines = Boolean(primary || secondary);
  const avatarSize = compact ? 30 : 34;
  const labelStyle = compact ? styles.labelCompact : styles.label;
  const primaryStyle = compact ? styles.primaryCompact : styles.primary;
  const secondaryStyle = compact ? styles.secondaryCompact : styles.secondary;

  if (!assigner || !hasLines) {
    return (
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          <PartyAvatar
            name={fallback}
            entityType="client"
            size={avatarSize}
            borderStyle={styles.avatarBorder}
          />
        </View>
        <View style={styles.textCol}>
          <Text style={[labelStyle, { color: mutedColor }]} numberOfLines={1}>
            Assigned by
          </Text>
          <Text style={[primaryStyle, { color: textColor }]} numberOfLines={1}>
            {fallback}
          </Text>
        </View>
      </View>
    );
  }

  const avatarName = primary || assigner.orgName || "Fleet";

  return (
    <View style={styles.row}>
      <View style={styles.avatarWrap}>
        <PartyAvatar
          name={avatarName}
          initialsColorSeed={assigner.orgId || assigner.orgName}
          organizationImageUrl={assigner.orgLogoUrl}
          organizationAvatarSeed={assigner.orgAvatarSeed}
          avatarUrl={assigner.orgAvatarUrl}
          entityType="client"
          size={avatarSize}
          borderStyle={styles.avatarBorder}
        />
      </View>
      <View style={styles.textCol}>
        <Text style={[labelStyle, { color: mutedColor }]} numberOfLines={1}>
          Assigned by
        </Text>
        <Text style={styles.partyLine} numberOfLines={1}>
          <Text style={[primaryStyle, { color: textColor }]}>{primary}</Text>
          {secondary ? (
            <>
              <Text style={[styles.dot, { color: mutedColor }]}> · </Text>
              <Text style={[secondaryStyle, { color: mutedColor }]}>
                {secondary}
              </Text>
            </>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 7,
    paddingTop: 2,
    minWidth: 0,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
    paddingTop: 2,
  },
  partyLine: {
    lineHeight: 13,
  },
  avatarBorder: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  labelCompact: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.25,
    lineHeight: 11,
  },
  primaryCompact: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  secondaryCompact: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  label: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  primary: {
    fontSize: 12,
    fontWeight: "600",
  },
  secondary: {
    fontSize: 12,
    fontWeight: "500",
  },
  dot: {
    fontWeight: "500",
  },
});
