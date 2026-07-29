import LottieView from "lottie-react-native";
import { memo, useMemo } from "react";
import { Text, View } from "react-native";

import type { AddTripWizardStep } from "@/features/trips/components/add-trip/addTripWizardSteps";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

const ASIDE_ANIMATIONS = {
  client: require("@/assets/Animated folder/loading-cargo.json"),
  route: require("@/assets/Animated folder/navigation.json"),
  commodity: require("@/assets/Animated folder/loading-cargo.json"),
  source: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  allocation: require("@/assets/Animated folder/truck-loading.json"),
} as const;

const ASIDE_COPY: Record<
  AddTripWizardStep,
  { eyebrow: string; title: string; body: string }
> = {
  client: {
    eyebrow: "Client",
    title: "Start with the buyer",
    body: "Pick the billing client and lock the sale value before the lane.",
  },
  route: {
    eyebrow: "Route",
    title: "Map a clean corridor",
    body: "Pick an office or warehouse from the client, or search pickup and drop.",
  },
  commodity: {
    eyebrow: "Load",
    title: "Frame the cargo",
    body: "Vehicle, load type, and tonnage keep ops and finance aligned.",
  },
  source: {
    eyebrow: "Supply",
    title: "Pick your source",
    body: "Run on your fleet or hand off to an aggregate partner.",
  },
  allocation: {
    eyebrow: "Dispatch",
    title: "Close the loop",
    body: "Assign driver and vehicle now, or finish details later.",
  },
};

const ROUTE_CONTRACT_COPY = {
  eyebrow: "Schedule",
  title: "Lock the trip date",
  body: "Pickup and drop come from the contract lane — set when the move should start.",
} as const;

export type CreateTripDesktopAsideArtProps = {
  wizardStep: AddTripWizardStep;
  /** `inline` — compact visual under a step tip (route page). */
  variant?: "aside" | "inline";
  /** When a contract lane is selected, route aside focuses on date. */
  contractRouteLocked?: boolean;
};

export const CreateTripDesktopAsideArt = memo(function CreateTripDesktopAsideArt({
  wizardStep,
  variant = "aside",
  contractRouteLocked = false,
}: CreateTripDesktopAsideArtProps) {
  const copy =
    wizardStep === "route" && contractRouteLocked
      ? ROUTE_CONTRACT_COPY
      : (ASIDE_COPY[wizardStep] ?? ASIDE_COPY.client);
  const source = useMemo(
    () => ASIDE_ANIMATIONS[wizardStep] ?? ASIDE_ANIMATIONS.client,
    [wizardStep],
  );
  const isInline = variant === "inline";

  return (
    <View
      style={[s.asideArtPanel, isInline && s.asideArtPanelInline]}
      accessibilityElementsHidden
    >
      {!isInline ? <View style={s.asideArtGlow} pointerEvents="none" /> : null}
      {!isInline ? (
        <>
          <Text style={s.asideArtEyebrow}>{copy.eyebrow}</Text>
          <Text style={s.asideArtTitle}>{copy.title}</Text>
          <Text style={s.asideArtBody}>{copy.body}</Text>
        </>
      ) : null}
      <View style={[s.asideArtLottieWrap, isInline && s.asideArtLottieWrapInline]}>
        <LottieView
          source={source}
          autoPlay
          loop
          speed={0.85}
          resizeMode="contain"
          style={[s.asideArtLottie, isInline && s.asideArtLottieInline]}
        />
      </View>
    </View>
  );
});
