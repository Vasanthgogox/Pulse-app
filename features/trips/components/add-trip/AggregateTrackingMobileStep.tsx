/**
 * Aggregate driver phone / name / vehicle — full-page keypad flows (Create Trip mobile).
 * Matches indent deploy + party wizard standard (no system keyboard on phone / plate).
 */
import { memo, useMemo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { User } from "lucide-react-native";

import { IndianVehicleRegistrationKeypadFlow } from "@/components/indianVehicle/IndianVehicleRegistrationKeypadFlow";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import { PhoneNumberKeypadFlow } from "@/components/party/keypad/PhoneNumberKeypadFlow";
import { fullPageWizardStyles } from "@/components/full-page-wizard";
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
  driverNameInputRef?: React.RefObject<TextInputType | null>;
  driverPhoneMatches?: readonly ExistingDriverMatch[];
  driverPhoneLookupLoading?: boolean;
  selectedDriverMatchId?: string | null;
  onSelectDriverMatch?: (match: ExistingDriverMatch) => void;
  driverPhoneInTrip?: boolean;
  driverNameFromPlatform?: string | null;
  /** Fleet roster for resolving recommended-driver avatars. */
  fleetDrivers?: readonly DriverRow[];
  testIDPrefix?: string;
}

export const AggregateTrackingMobileStep = memo(function AggregateTrackingMobileStep({
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
  driverNameInputRef,
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
            Driver is on another trip — ask them to finish it before assigning here.
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
    driverPhoneMatches.find((m) => m.user_id === selectedDriverMatchId)?.full_name?.trim() ||
    driverNameFromPlatform?.trim() ||
    null;
  const showSuggestion =
    suggestedName && suggestedName !== driverName.trim();

  return (
    <View style={styles.nameRoot}>
      {showSuggestion ? (
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

      <Text style={fullPageWizardStyles.wizardFieldLabel}>Driver name *</Text>
      <TextInput
        ref={driverNameInputRef}
        style={[
          fullPageWizardStyles.wizardFieldInput,
          invalid("driverName") && styles.inputError,
          Platform.OS === "web" && styles.webInput,
        ]}
        placeholder="e.g. Suresh Kumar"
        placeholderTextColor={Theme.textMuted}
        value={driverName}
        onChangeText={onDriverNameChange}
        autoCapitalize="words"
        autoCorrect={false}
        testID={`${testIDPrefix}-driver-name`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  nameRoot: {
    flex: 1,
    minHeight: 200,
    gap: 14,
    paddingTop: 8,
    ...Platform.select({
      web: { maxWidth: 520, alignSelf: "center", width: "100%" },
      default: {},
    }),
  },
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: Theme.cardWhite,
  },
  suggestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestText: {
    flex: 1,
    minWidth: 0,
  },
  suggestLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  suggestName: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  webInput: {
    outlineStyle: "none",
  } as object,
  inputError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
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
