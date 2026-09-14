import { Handshake, Megaphone } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import Theme from "@/constants/Theme";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import type { MarketFulfillment } from "./types";

export type CreateTripMarketFulfillmentStepProps = {
  value: MarketFulfillment | null;
  onChange: (value: MarketFulfillment) => void;
  showExistingSupplier?: boolean;
  showShareForBidding?: boolean;
  compact?: boolean;
};

export const CreateTripMarketFulfillmentStep = memo(
  function CreateTripMarketFulfillmentStep({
    value,
    onChange,
    showExistingSupplier = true,
    showShareForBidding = true,
    compact = false,
  }: CreateTripMarketFulfillmentStepProps) {
    return (
      <View style={[s.stepBody, compact && s.compactStepBody]}>
        <View style={s.stepSection}>
          <View style={s.sourceModeRow}>
            {showExistingSupplier ? (
              <Pressable
                style={[
                  s.sourceModeCard,
                  value === "supplier" && s.sourceModeCardActive,
                ]}
                onPress={() => onChange("supplier")}
                accessibilityRole="button"
                accessibilityState={{ selected: value === "supplier" }}
                accessibilityLabel="Existing supplier"
              >
                <View
                  style={[
                    s.sourceModeIcon,
                    value === "supplier" && s.sourceModeIconActive,
                  ]}
                >
                  <Handshake
                    size={20}
                    color={
                      value === "supplier"
                        ? Theme.textOnPrimary
                        : Theme.textRouteCard
                    }
                    strokeWidth={2.25}
                  />
                </View>
                <View style={s.sourceModeCopy}>
                  <Text
                    style={[
                      s.sourceModeTitle,
                      value === "supplier" && s.sourceModeTitleActive,
                    ]}
                  >
                    Existing supplier
                  </Text>
                  <Text style={s.sourceModeSub}>
                    Book a known partner at a supplier rate, then create a trip
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {showShareForBidding ? (
              <Pressable
                style={[
                  s.sourceModeCard,
                  value === "bid" && s.sourceModeCardActive,
                ]}
                onPress={() => onChange("bid")}
                accessibilityRole="button"
                accessibilityState={{ selected: value === "bid" }}
                accessibilityLabel="Share for bidding"
              >
                <View
                  style={[
                    s.sourceModeIcon,
                    value === "bid" && s.sourceModeIconActive,
                  ]}
                >
                  <Megaphone
                    size={20}
                    color={
                      value === "bid" ? Theme.textOnPrimary : Theme.textRouteCard
                    }
                    strokeWidth={2.25}
                  />
                </View>
                <View style={s.sourceModeCopy}>
                  <Text
                    style={[
                      s.sourceModeTitle,
                      value === "bid" && s.sourceModeTitleActive,
                    ]}
                  >
                    Share for bidding
                  </Text>
                  <Text style={s.sourceModeSub}>
                    Circulate on Network, Marketplace, or both as an indent
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  },
);
