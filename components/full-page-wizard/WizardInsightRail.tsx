import { memo } from "react";
import { Text, View } from "react-native";

import Theme from "@/constants/Theme";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type WizardInsightAccent = "indigo" | "green" | "amber";

export type WizardInsightCard = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  accent?: WizardInsightAccent;
};

const accentStyles: Record<
  WizardInsightAccent,
  { stripe: string; wash: string; eyebrow: string }
> = {
  indigo: {
    stripe: Theme.primary,
    wash: "rgba(79, 70, 229, 0.08)",
    eyebrow: Theme.primary,
  },
  green: {
    stripe: Theme.positive,
    wash: "rgba(16, 185, 129, 0.1)",
    eyebrow: Theme.positive,
  },
  amber: {
    stripe: Theme.warning,
    wash: "rgba(245, 158, 11, 0.12)",
    eyebrow: Theme.warning,
  },
};

export type WizardInsightRailProps = {
  cards: WizardInsightCard[];
  side: "left" | "right";
};

export const WizardInsightRail = memo(function WizardInsightRail({
  cards,
  side,
}: WizardInsightRailProps) {
  return (
    <View
      style={[
        styles.desktopInsightRail,
        side === "left" ? styles.desktopInsightRailLeft : styles.desktopInsightRailRight,
      ]}
    >
      <Text style={styles.desktopInsightRailHeading}>
        {side === "left" ? "Grow with Pulse" : "Quick tips"}
      </Text>
      {cards.map((card) => {
        const accent = accentStyles[card.accent ?? "indigo"];
        return (
          <View
            key={card.id}
            style={[styles.desktopInsightCard, { backgroundColor: accent.wash }]}
          >
            <View style={[styles.desktopInsightStripe, { backgroundColor: accent.stripe }]} />
            <Text style={[styles.desktopInsightEyebrow, { color: accent.eyebrow }]}>
              {card.eyebrow}
            </Text>
            <Text style={styles.desktopInsightTitle}>{card.title}</Text>
            <Text style={styles.desktopInsightBody}>{card.body}</Text>
          </View>
        );
      })}
    </View>
  );
});
