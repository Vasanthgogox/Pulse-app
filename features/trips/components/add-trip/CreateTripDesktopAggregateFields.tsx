import { memo } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { SmartInput } from "@/components/mobile-input";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { WizardEntitySummaryCard } from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import { DriverPhoneRecommendations } from "@/features/trips/components/add-trip/DriverPhoneRecommendations";
import { normalizeIndianMobileLast10 } from "@/features/trips/utils/driverPhoneLookup.util";
import {
  applyIndianVehicleKeystroke,
  getIndianVehicleKeyboardType,
  getIndianVehicleNormalizedLength,
} from "@/lib/indianVehicleInput.util";
import type { AddTripIssueField } from "./useAddTripForm";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopAggregateFieldsProps = {
  partnerRate: string;
  onPartnerRateChange: (value: string) => void;
  advancePaid: string;
  onAdvancePaidChange: (value: string) => void;
  partyPreview?: NumericEntryPartyPreview;
  suppressPartyPreview?: boolean;
  rateError?: boolean;
  advanceError?: boolean;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  vehicleText: string;
  onVehicleTextChange: (value: string) => void;
  invalid: (field: AddTripIssueField) => boolean;
  driverPhoneMatches?: readonly ExistingDriverMatch[];
  driverPhoneLookupLoading?: boolean;
  selectedDriverMatchId?: string | null;
  onSelectDriverMatch?: (match: ExistingDriverMatch) => void;
  driverPhoneInTrip?: boolean;
};

export const CreateTripDesktopAggregateFields = memo(
  function CreateTripDesktopAggregateFields({
    partnerRate,
    onPartnerRateChange,
    advancePaid,
    onAdvancePaidChange,
    partyPreview,
    suppressPartyPreview = false,
    rateError = false,
    advanceError = false,
    driverName,
    onDriverNameChange,
    driverPhone,
    onDriverPhoneChange,
    vehicleText,
    onVehicleTextChange,
    invalid,
    driverPhoneMatches = [],
    driverPhoneLookupLoading = false,
    selectedDriverMatchId = null,
    onSelectDriverMatch,
  }: CreateTripDesktopAggregateFieldsProps) {
    const phoneLast10 = normalizeIndianMobileLast10(driverPhone);
    const phoneComplete = phoneLast10.length >= 10;
    const vehicleLen = getIndianVehicleNormalizedLength(vehicleText);
    const vehicleKeyboard = getIndianVehicleKeyboardType(vehicleLen);

    return (
      <View style={s.allocationForm}>
        {partyPreview && !suppressPartyPreview ? (
          <WizardEntitySummaryCard
            label="Partner"
            name={partyPreview.name}
            subtitle={partyPreview.subtitle ?? null}
            entityType={partyPreview.entityType ?? "supplier"}
            avatarUrl={partyPreview.avatarUrl ?? null}
            avatarSeed={partyPreview.avatarSeed ?? null}
          />
        ) : null}

        <View style={s.allocationFormRow}>
          <View style={s.allocationFormCol}>
            <SmartInput
              type="currency"
              label="Partner rate"
              value={partnerRate}
              onChange={onPartnerRateChange}
              variant="field"
              required
              errorMessage={rateError ? "Enter partner rate" : undefined}
            />
          </View>
          <View style={s.allocationFormCol}>
            <SmartInput
              type="currency"
              label="Advance paid"
              value={advancePaid}
              onChange={onAdvancePaidChange}
              variant="field"
              errorMessage={advanceError ? "Invalid advance amount" : undefined}
            />
          </View>
        </View>

        <View style={[s.allocationFormRow, s.allocationFormRowTop]}>
          <View style={s.allocationFormCol}>
            <View style={s.allocationFieldBlock}>
              <Text style={s.routeFieldLabel}>Driver phone *</Text>
              <TextInput
                style={[s.dateInput, invalid("driverPhone") && s.routeInputShellError]}
                placeholder="+91 mobile number"
                placeholderTextColor={Theme.placeholder}
                value={driverPhone}
                onChangeText={onDriverPhoneChange}
                keyboardType="phone-pad"
                maxLength={14}
              />
            </View>
            {onSelectDriverMatch ? (
              <DriverPhoneRecommendations
                matches={driverPhoneMatches}
                loading={driverPhoneLookupLoading}
                selectedUserId={selectedDriverMatchId}
                onSelect={onSelectDriverMatch}
                phoneComplete={phoneComplete}
                layout="stack"
                emptyHint="Enter the driver’s real name in the field below, or invite them to Pulse first."
              />
            ) : null}
          </View>

          <View style={s.allocationFormCol}>
            <View style={s.allocationFieldBlock}>
              <Text style={s.routeFieldLabel}>Vehicle number *</Text>
              <TextInput
                style={[s.dateInput, invalid("vehicleNumber") && s.routeInputShellError]}
                placeholder="e.g. TN 12 AB 3456"
                placeholderTextColor={Theme.placeholder}
                value={vehicleText}
                onChangeText={(v) => onVehicleTextChange(applyIndianVehicleKeystroke(v))}
                keyboardType={vehicleKeyboard}
                autoCapitalize={vehicleKeyboard === "number-pad" ? "none" : "characters"}
                autoCorrect={false}
                {...Platform.select({
                  web: { outlineStyle: "none" } as object,
                  default: {},
                })}
              />
            </View>
          </View>
        </View>

        <View style={s.allocationFieldBlockFull}>
          <Text style={s.routeFieldLabel}>Driver name *</Text>
          <TextInput
            style={[s.dateInput, invalid("driverName") && s.routeInputShellError]}
            placeholder="Enter driver’s full name"
            placeholderTextColor={Theme.placeholder}
            value={driverName}
            onChangeText={onDriverNameChange}
            autoCapitalize="words"
          />
        </View>
      </View>
    );
  },
);
