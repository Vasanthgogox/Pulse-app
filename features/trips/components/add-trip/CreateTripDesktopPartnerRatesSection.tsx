import { memo } from "react";
import { View } from "react-native";

import { SmartInput } from "@/components/mobile-input";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { WizardEntitySummaryCard } from "@/components/full-page-wizard";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopPartnerRatesSectionProps = {
  partnerRate: string;
  onPartnerRateChange: (value: string) => void;
  advancePaid: string;
  onAdvancePaidChange: (value: string) => void;
  partyPreview?: NumericEntryPartyPreview;
  suppressPartyPreview?: boolean;
  rateError?: boolean;
  advanceError?: boolean;
};

export const CreateTripDesktopPartnerRatesSection = memo(
  function CreateTripDesktopPartnerRatesSection({
    partnerRate,
    onPartnerRateChange,
    advancePaid,
    onAdvancePaidChange,
    partyPreview,
    suppressPartyPreview = false,
    rateError = false,
    advanceError = false,
  }: CreateTripDesktopPartnerRatesSectionProps) {
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
      </View>
    );
  },
);
