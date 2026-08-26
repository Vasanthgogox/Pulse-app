/**
 * Aggregate driver phone / name / vehicle — full-page keypad flows (Create Trip mobile).
 * Matches indent deploy + party wizard standard (no system keyboard on phone / name / plate).
 */
import { memo, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { User } from "lucide-react-native";

import { IndianVehicleRegistrationKeypadFlow } from "@/components/indianVehicle/IndianVehicleRegistrationKeypadFlow";
import { DriverNameKeypadFlow } from "@/components/party/keypad/DriverNameKeypadFlow";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import { PhoneNumberKeypadFlow } from "@/components/party/keypad/PhoneNumberKeypadFlow";
import Theme from "@/constants/Theme";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { DriverPhoneRecommendations } from "@/features/trips/components/add-trip/DriverPhoneRecommendations";
import { normalizeIndianMobileLast10 } from "@/features/trips/utils/driverPhoneLookup.util";
import type { AddTripIssueField } from "./useAddTripForm";

export type AggregateTrackingStep = "driverPhone" | "driverName" | "vehicle";

export interface AggregateTrackingMobileStepProps {
  step: AggregateTrackingStep;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  vehicleText: string;
  onVehicleTextChange: (value: string) => void;
  /** Own-asset vs third-party choice for a supplier-linked (Aggregate) trip. Omit to hide the toggle (e.g. non-aggregate assignment flows). */
  isOwnAsset?: boolean | null;
  onIsOwnAssetChange?: (value: boolean | null) => void;
  invalid: (field: AddTripIssueField) => boolean;
  driverPhoneMatches?: readonly ExistingDriverMatch[];
  driverPhoneLookupLoading?: boolean;
  selectedDriverMatchId?: string | null;
  onSelectDriverMatch?: (match: ExistingDriverMatch) => void;
  driverPhoneInTrip?: boolean;
  driverNameFromPlatform?: string | null;
  fleetDrivers?: readonly DriverRow[];
  testIDPrefix?: string;
}

export const AggregateTrackingMobileStep = memo(
  function AggregateTrackingMobileStep({
    step,
    driverName,
    onDriverNameChange,
    driverPhone,
    onDriverPhoneChange,
    vehicleText,
    onVehicleTextChange,
    isOwnAsset = null,
    onIsOwnAssetChange,
    invalid,
    driverPhoneMatches = [],
    driverPhoneLookupLoading = false,
    selectedDriverMatchId = null,
    onSelectDriverMatch,
    driverPhoneInTrip = false,
    driverNameFromPlatform,
    fleetDrivers = [],
    testIDPrefix = "add-trip-aggregate",
  }: AggregateTrackingMobileStepProps) {
    const phoneLast10 = useMemo(
      () => normalizeIndianMobileLast10(driverPhone),
      [driverPhone],
    );
    const phoneComplete = phoneLast10.length >= 10;

    const phoneFooterExtras = useMemo((): ReactNode => {
      if (!onSelectDriverMatch) return null;
      return (
        <>
          {driverPhoneInTrip ? (
            <Text style={styles.phoneBusy}>
              Driver is on another trip — ask them to finish it before assigning
              here.
            </Text>
          ) : null}
          <DriverPhoneRecommendations
            matches={driverPhoneMatches}
            loading={driverPhoneLookupLoading}
            selectedUserId={selectedDriverMatchId}
            onSelect={onSelectDriverMatch}
            phoneComplete={phoneComplete}
            compact
            fleetDrivers={fleetDrivers}
          />
        </>
      );
    }, [
      driverPhoneInTrip,
      driverPhoneMatches,
      driverPhoneLookupLoading,
      selectedDriverMatchId,
      onSelectDriverMatch,
      phoneComplete,
      fleetDrivers,
    ]);

    if (step === "driverPhone") {
      return (
        <PhoneNumberKeypadFlow
          label="Driver phone *"
          placeholder="10-digit number"
          value={driverPhone}
          onChangeText={onDriverPhoneChange}
          error={invalid("driverPhone") || driverPhoneInTrip}
          footerExtras={phoneFooterExtras}
          testID={`${testIDPrefix}-driver-phone`}
          wizardShell
        />
      );
    }

    if (step === "vehicle") {
      return (
        <View style={flow.root}>
          <IndianVehicleRegistrationKeypadFlow
            value={vehicleText}
            onChangeText={onVehicleTextChange}
            error={invalid("vehicleNumber")}
            testID={`${testIDPrefix}-vehicle-keypad`}
            wizardShell
            label="Vehicle number *"
          />
          {onIsOwnAssetChange ? (
            <View style={styles.ownAssetRoot}>
              <Text style={styles.ownAssetLabel}>Whose vehicle is this?</Text>
              <View style={styles.ownAssetRow}>
                <Pressable
                  style={[
                    styles.ownAssetOption,
                    isOwnAsset === true && styles.ownAssetOptionSelected,
                  ]}
                  onPress={() => onIsOwnAssetChange(true)}
                  accessibilityRole="button"
                  testID={`${testIDPrefix}-own-asset-yes`}
                >
                  <Text
                    style={[
                      styles.ownAssetOptionText,
                      isOwnAsset === true && styles.ownAssetOptionTextSelected,
                    ]}
                  >
                    Supplier's own vehicle
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.ownAssetOption,
                    isOwnAsset === false && styles.ownAssetOptionSelected,
                  ]}
                  onPress={() => onIsOwnAssetChange(false)}
                  accessibilityRole="button"
                  testID={`${testIDPrefix}-own-asset-no`}
                >
                  <Text
                    style={[
                      styles.ownAssetOptionText,
                      isOwnAsset === false && styles.ownAssetOptionTextSelected,
                    ]}
                  >
                    Third-party / outsourced
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.ownAssetHint}>
                Not sure? Leave unselected — this trip is treated as outsourced by default.
              </Text>
            </View>
          ) : null}
        </View>
      );
    }

    const suggestedName =
      driverPhoneMatches.find((m) => m.user_id === selectedDriverMatchId)
        ?.full_name?.trim() ||
      driverNameFromPlatform?.trim() ||
      null;
    const showSuggestion =
      Boolean(suggestedName) && suggestedName !== driverName.trim();

    const nameFooterExtras = (
      <>
        {showSuggestion && suggestedName ? (
          <Pressable
            style={styles.suggestRow}
            onPress={() => onDriverNameChange(suggestedName)}
            accessibilityRole="button"
          >
            <View style={styles.suggestAvatar}>
              <User size={16} color={Theme.iconPrimary} />
            </View>
            <View style={styles.suggestText}>
              <Text style={styles.suggestLabel}>Use suggested name</Text>
              <Text style={styles.suggestName} numberOfLines={1}>
                {suggestedName}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {driverPhoneMatches.length > 1 &&
        !selectedDriverMatchId &&
        onSelectDriverMatch ? (
          <DriverPhoneRecommendations
            matches={driverPhoneMatches}
            loading={false}
            selectedUserId={selectedDriverMatchId}
            onSelect={onSelectDriverMatch}
            phoneComplete
            compact
            fleetDrivers={fleetDrivers}
          />
        ) : null}
      </>
    );

    return (
      <DriverNameKeypadFlow
        value={driverName}
        onChangeText={onDriverNameChange}
        label="Driver name *"
        placeholder="e.g. SURESH KUMAR"
        error={invalid("driverName")}
        footerExtras={nameFooterExtras}
        testID={`${testIDPrefix}-driver-name`}
        wizardShell
      />
    );
  },
);

const styles = StyleSheet.create({
  phoneBusy: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.destructive,
    lineHeight: 18,
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginBottom: 8,
  },
  suggestAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  suggestText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  suggestLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  suggestName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  ownAssetRoot: {
    marginTop: 16,
    gap: 8,
  },
  ownAssetLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  ownAssetRow: {
    flexDirection: "row",
    gap: 8,
  },
  ownAssetOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
  },
  ownAssetOptionSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  ownAssetOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  ownAssetOptionTextSelected: {
    color: Theme.primary,
  },
  ownAssetHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
});
