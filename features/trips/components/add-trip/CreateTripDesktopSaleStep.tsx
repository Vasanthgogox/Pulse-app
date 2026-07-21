import { Info } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import Theme from "@/constants/Theme";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import type { ClientRow } from "@/features/clients/services/clients.service";

import { ClientSaleKeypadFlow } from "./ClientSaleKeypadFlow";
import { DesktopInputShell, DesktopPill, entityInitials } from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

const PAYMENT_TERMS = ["Contract", "Adhoc"] as const;

export type CreateTripDesktopSaleStepProps = {
  clientPrice: string;
  onClientPriceChange: (value: string) => void;
  selectedClient: ClientRow | null;
  priceError?: boolean;
  /** Mobile: Google/pay-style full-page value entry + single-row terms. */
  compact?: boolean;
};

export const CreateTripDesktopSaleStep = memo(function CreateTripDesktopSaleStep({
  clientPrice,
  onClientPriceChange,
  selectedClient,
  priceError = false,
  compact = false,
}: CreateTripDesktopSaleStepProps) {
  const [paymentTerm, setPaymentTerm] = useState<(typeof PAYMENT_TERMS)[number]>("Contract");

  const partyPreview = useMemo(
    () =>
      selectedClient
        ? {
            name: selectedClient.name ?? "Client",
            subtitle: resolveWizardClientPhone(selectedClient.phone) ?? undefined,
            entityType: "client" as const,
            avatarUrl: selectedClient.avatar_url ?? null,
            avatarSeed: selectedClient.avatar_seed ?? null,
          }
        : undefined,
    [selectedClient],
  );

  const paymentTermsRow = (
    <View style={s.saleMobileTermsBlock}>
      <Text style={s.desktopFieldLabel}>Payment terms</Text>
      <View style={s.saleMobilePaymentTermsRow}>
        {PAYMENT_TERMS.map((term) => (
          <DesktopPill
            key={term}
            label={term}
            flex
            active={paymentTerm === term}
            onPress={() => setPaymentTerm(term)}
          />
        ))}
      </View>
    </View>
  );

  if (compact) {
    return (
      <View style={s.saleMobileKeypadRoot}>
        <ClientSaleKeypadFlow
          clientPrice={clientPrice}
          onClientPriceChange={onClientPriceChange}
          partyPreview={partyPreview}
          errorMessage={
            priceError ? "Enter a sale price greater than 0" : undefined
          }
          accessory={paymentTermsRow}
        />
      </View>
    );
  }

  return (
    <View style={s.stepBody}>
      <View style={s.commodityClientGrid}>
        <View style={s.commodityClientLoadCol}>
          <View style={s.stepSection}>
            <Text style={s.sectionHeading}>Client</Text>
            {selectedClient ? (
              <DesktopInputShell>
                <View style={s.saleClientCard}>
                  <View style={s.saleClientAvatar}>
                    <Text style={s.saleClientAvatarText}>
                      {entityInitials(selectedClient.name ?? "Client")}
                    </Text>
                  </View>
                  <View style={s.saleClientCopy}>
                    <Text style={s.saleClientName} numberOfLines={1}>
                      {selectedClient.name ?? "Client"}
                    </Text>
                    <Text style={s.saleClientPhone} numberOfLines={1}>
                      {resolveWizardClientPhone(selectedClient.phone) ?? "—"}
                    </Text>
                  </View>
                </View>
              </DesktopInputShell>
            ) : (
              <Text style={s.saleClientMissing}>Select a client on the Load step.</Text>
            )}
          </View>
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

        <View style={s.commodityClientPickerCol}>
          <View style={s.stepSection}>
            <Text style={s.sectionHeading}>Sale price</Text>
            <View style={s.salePriceField}>
              <Text style={s.desktopFieldLabel}>Client sale price *</Text>
              <DesktopInputShell error={priceError}>
                <View style={s.salePriceInputShell}>
                  <Text style={s.salePriceCurrency}>₹</Text>
                  <TextInput
                    style={s.salePriceInput}
                    value={clientPrice}
                    onChangeText={onClientPriceChange}
                    placeholder="0"
                    placeholderTextColor={Theme.placeholder}
                    keyboardType={Platform.OS === "web" ? "numeric" : "decimal-pad"}
                    {...Platform.select({
                      web: { inputMode: "numeric" } as object,
                      default: {},
                    })}
                  />
                </View>
              </DesktopInputShell>
              {priceError ? (
                <Text style={s.salePriceError}>Enter a sale price greater than 0</Text>
              ) : null}
            </View>

            <View style={[s.salePriceField, s.saleTermsGap]}>
              <Text style={s.desktopFieldLabel}>Payment terms</Text>
              <View style={s.paymentTermsRow}>
                {PAYMENT_TERMS.map((term) => (
                  <DesktopPill
                    key={term}
                    label={term}
                    flex
                    active={paymentTerm === term}
                    onPress={() => setPaymentTerm(term)}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});
