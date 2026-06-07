/**
 * Financial overview hero — matches entity detail scorecard (client / supplier /
 * driver / vehicle). Slate gradient, large primary metric, expense/paid/due split.
 */
import { memo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { entityHeroScorecardStyles as s } from "@/components/entityHeroScorecard.styles";
import Theme from "@/constants/Theme";
import { isPulseDesktop } from "./pulseStyles";

export interface PulseFinancialOverviewProps {
  /** e.g. VEHICLE SALES, TOTAL SALES, TOTAL COST */
  primaryMetricLabel: string;
  primaryValue: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  decorIcon?: keyof typeof FontAwesome.glyphMap;
}

export const PulseFinancialOverviewCard = memo(function PulseFinancialOverviewCard({
  primaryMetricLabel,
  primaryValue,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  decorIcon = "line-chart",
}: PulseFinancialOverviewProps) {
  const { width } = useWindowDimensions();
  const desktop = isPulseDesktop(width);

  return (
    <LinearGradient
      colors={[Theme.financeCardSlateFrom, Theme.financeCardSlateTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.scorecard, desktop && s.scorecardWebDesktop, { marginBottom: 0 }]}
    >
      {desktop ? (
        <View style={s.scorecardDecorIconWrap} pointerEvents="none">
          <FontAwesome
            name={decorIcon}
            size={120}
            color={Theme.textOnDark}
            style={s.scorecardDecorIcon}
          />
        </View>
      ) : null}

      <View style={[s.scorecardTop, desktop && s.scorecardTopWebDesktop]}>
        <View style={s.scorecardLeft}>
          <Text style={s.scorecardLabel}>FINANCIAL OVERVIEW</Text>
          <Text style={s.scorecardSalesLabel}>{primaryMetricLabel}</Text>
          <Text
            style={[s.scorecardAmount, desktop && s.scorecardAmountWebDesktop]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {primaryValue}
          </Text>
        </View>
      </View>

      <View style={[s.scorecardGrid, desktop && s.scorecardGridWebDesktop]}>
        <View style={desktop ? s.scorecardGridStat : undefined}>
          <Text style={s.scorecardGridLabelPaid}>{leftLabel}</Text>
          <Text
            style={[
              s.scorecardGridPaid,
              desktop && s.scorecardGridPaidWebDesktop,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {leftValue}
          </Text>
        </View>
        <View style={[s.scorecardGridRight, desktop && s.scorecardGridStat]}>
          <Text style={s.scorecardGridLabelDue}>{rightLabel}</Text>
          <Text
            style={[
              s.scorecardGridDue,
              desktop && s.scorecardGridDueWebDesktop,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {rightValue}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
});
