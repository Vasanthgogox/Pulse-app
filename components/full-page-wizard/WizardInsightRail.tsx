import { memo, type ComponentType } from "react";
import { Text, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import Theme from "@/constants/Theme";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type WizardInsightAccent = "indigo" | "green" | "amber";

export type WizardInsightCard = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  accent?: WizardInsightAccent;
  illustration?: ComponentType<SvgProps>;
  icon?: ComponentType<SvgProps>;
};

const accentStyles: Record<
  WizardInsightAccent,
  { eyebrow: string }
> = {
  indigo: {
    eyebrow: Theme.textMuted,
  },
  green: {
    eyebrow: Theme.textMuted,
  },
  amber: {
    eyebrow: Theme.textMuted,
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
  const isSingleBanner = cards.length === 1;
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
        const Illustration = card.illustration;
        return (
          <View
            key={card.id}
            style={[
              styles.desktopInsightCard,
              isSingleBanner && styles.desktopInsightCardSingle,
            ]}
          >
            {Illustration ? (
              <View
                style={[
                  styles.desktopInsightWatermark,
                  isSingleBanner && styles.desktopInsightWatermarkSingle,
                ]}
                pointerEvents="none"
              >
                <Illustration
                  width={isSingleBanner ? 136 : 94}
                  height={isSingleBanner ? 102 : 70}
                />
              </View>
            ) : null}
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
