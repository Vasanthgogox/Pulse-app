import { Info } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { SmartInput } from "@/components/mobile-input";
import { WizardClientSummaryCard } from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import type { ClientRow } from "@/features/clients/services/clients.service";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopSaleStepProps = {
  clientPrice: string;
  onClientPriceChange: (value: string) => void;
  selectedClient: ClientRow | null;
  priceError?: boolean;
};

export const CreateTripDesktopSaleStep = memo(function CreateTripDesktopSaleStep({
  clientPrice,
  onClientPriceChange,
  selectedClient,
  priceError = false,
}: CreateTripDesktopSaleStepProps) {
  return (
    <View style={s.stepBody}>
      <View style={s.stepGrid}>
        <View style={s.stepGridMain}>
          {selectedClient ? (
            <WizardClientSummaryCard
              name={selectedClient.name ?? "Client"}
              subtitle={resolveWizardClientPhone(selectedClient.phone) ?? undefined}
              avatarUrl={selectedClient.avatar_url ?? null}
              avatarSeed={selectedClient.avatar_seed ?? null}
            />
          ) : null}
          <View style={s.infoBanner}>
            <View style={s.infoBannerIcon}>
              <Info size={18} color={Theme.brandBlueInk} strokeWidth={2.5} />
            </View>
            <View style={s.infoBannerCopy}>
              <Text style={s.infoBannerTitle}>Billing guidance</Text>
              <Text style={s.infoBannerBody}>
                Revenue should match what you bill this client for this lane. Adjust if
                this trip differs from your standard rate.
              </Text>
            </View>
          </View>
        </View>
        <View style={s.stepGridAside}>
          <SmartInput
            type="currency"
            label="Client sale price"
            value={clientPrice}
            onChange={onClientPriceChange}
            variant="field"
            density="default"
            required
            errorMessage={priceError ? "Enter a sale price greater than 0" : undefined}
          />
        </View>
      </View>
    </View>
  );
});
