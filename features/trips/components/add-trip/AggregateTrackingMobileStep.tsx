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
  invalid: (field: AddTripIssueField) => boolean;
  driverNameInputRef?: React.RefObject<TextInputType | null>;
  driverPhoneMatches?: readonly ExistingDriverMatch[];
  driverPhoneLookupLoading?: boolean;
  selectedDriverMatchId?: string | null;
  onSelectDriverMatch?: (match: ExistingDriverMatch) => void;
  driverPhoneInTrip?: boolean;
  driverNameFromPlatform?: string | null;
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
  invalid,
  driverNameInputRef,
  driverPhoneMatches = [],
  driverPhoneLookupLoading = false,
  selectedDriverMatchId = null,
  onSelectDriverMatch,
  driverPhoneInTrip = false,
  driverNameFromPlatform,
  testIDPrefix = "add-trip-aggregate",
}: AggregateTrackingMobileStepProps) {
  const phoneLast10 = useMemo(
    () => normalizeIndianMobileLast10(driverPhone),
    [driverPhone],
  );
  const phoneComplete = phoneLast10.length >= 10;

  const phoneFooterExtras = useMemo((): ReactNode => {
    if (!onSelectDriverMatch) return null;
    if (driverPhoneInTrip) {
      return (
        <Text style={styles.phoneBusy}>
          This driver is already on an active trip — use another number.
        </Text>
      );
    }
    return (
      <DriverPhoneRecommendations
        matches={driverPhoneMatches}
        loading={driverPhoneLookupLoading}
        selectedUserId={selectedDriverMatchId}
        onSelect={onSelectDriverMatch}
        phoneComplete={phoneComplete}
        compact
      />
    );
  }, [
    driverPhoneInTrip,
    driverPhoneMatches,
    driverPhoneLookupLoading,
    selectedDriverMatchId,
    onSelectDriverMatch,
    phoneComplete,
  ]);

  if (step === "driverPhone") {
    return (
      <PhoneNumberKeypadFlow
        label="Driver phone (tracking) *"
        placeholder="10-digit number"
        value={driverPhone}
        onChangeText={onDriverPhoneChange}
        error={invalid("driverPhone")}
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
      />
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
        />
      ) : null}

      <Text style={fullPageWizardStyles.wizardFieldLabel}>Driver name (tracking) *</Text>
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
    gap: 12,
    paddingTop: 4,
    ...Platform.select({
      web: { maxWidth: 520, alignSelf: "center", width: "100%" },
      default: {},
    }),
  },
  phoneBusy: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.destructive,
    lineHeight: 17,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestText: {
    flex: 1,
    minWidth: 0,
  },
  suggestLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  suggestName: {
    fontSize: 14,
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
});
