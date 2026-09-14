import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ReceiptText } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";
import { getTripDisplayNumber } from "../../../services/trips.service";
import { getIndentOperationalLineageCode } from "@/features/operations/display";
import {
  getHubTripKind,
  type AggregateTripKindPillContext,
} from "@/features/drivers/utils/driverUtils.util";

interface TripDetailHeaderProps {
  trip: TripRow;
  onBack: () => void;
  onAddEntry: () => void;
  /** Optional hub viewer context; DCO is still only `operating_mode`. */
  aggregateTripKindPillContext?: AggregateTripKindPillContext | null;
}

export function TripDetailHeader({
  trip,
  onBack,
  onAddEntry,
  aggregateTripKindPillContext,
}: TripDetailHeaderProps) {
  const hubTripKind = getHubTripKind(trip, aggregateTripKindPillContext);
  const isAsset = hubTripKind === "asset";
  const kindLabel =
    hubTripKind === "dco" ? "DCO" : hubTripKind === "aggregate" ? "AGGREGATE" : "ASSET";
  const tripNumber = getTripDisplayNumber(trip);
  const sourceIndentLabel = getIndentOperationalLineageCode(trip);

  return (
    <View style={styles.root}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <FontAwesome name="chevron-left" size={16} color={Theme.textMuted} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {tripNumber}
        </Text>
        <Text style={styles.subtitle}>
          Trip Details
          {sourceIndentLabel ? ` · Created from ${sourceIndentLabel}` : ""}
        </Text>

        <View
          style={[styles.kindPill, isAsset ? styles.kindPillAsset : styles.kindPillAggregate]}
          accessibilityLabel={
            hubTripKind === "dco"
              ? "DCO trip"
              : hubTripKind === "aggregate"
                ? "Aggregate based trip"
                : "Asset based trip"
          }
        >
          <FontAwesome
            name={isAsset ? "truck" : hubTripKind === "dco" ? "user" : "link"}
            size={9}
            color={isAsset ? Theme.darkGreen : Theme.aggregatePillText}
          />
          <Text
            style={[
              styles.kindPillText,
              isAsset ? styles.kindPillTextAsset : styles.kindPillTextAggregate,
            ]}
          >
            {kindLabel}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onAddEntry}
        style={styles.actionBtn}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Add entry"
      >
        <SemanticAddIcon
          IconComponent={ReceiptText}
          iconSize={16}
          iconColor={Theme.textOnPrimary}
          badgeSize={16}
          badgeIconSize={11}
          badgeBackgroundColor={Theme.textOnPrimary}
          badgeIconColor={Theme.darkBackground}
          badgeOffsetX={-7}
          badgeOffsetY={-5}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: Theme.surfaceGray,
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindPillAsset: {
    backgroundColor: "rgba(21,128,61,0.10)",
  },
  kindPillAggregate: {
    backgroundColor: Theme.aggregatePillBg,
  },
  kindPillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  kindPillTextAsset: {
    color: Theme.darkGreen,
  },
  kindPillTextAggregate: {
    color: Theme.aggregatePillText,
  },
  actionBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
});
