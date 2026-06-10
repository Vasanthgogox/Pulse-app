/**
 * Metronic-style help + support cards below the network hub content.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  NetworkHelpQuestionsIllustration,
  NetworkHelpSupportIllustration,
} from "@/features/network/components/NetworkSupportHelpIllustrations";
import type { ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

const STACK_BREAKPOINT = 768;

function webBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "").trim().replace(/\/$/, "");
}

type HelpCardProps = {
  title: string;
  description: string;
  ctaLabel: string;
  onPress: () => void;
  illustration: ReactNode;
};

function HelpCard({ title, description, ctaLabel, onPress, illustration }: HelpCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.cardTextCol}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
        <View style={styles.cardIllustration}>{illustration}</View>
      </View>
      <View style={styles.cardDivider} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cardCtaRow, pressed && styles.cardCtaPressed]}
        accessibilityRole="link"
      >
        <Text style={styles.cardCtaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

export function NetworkSupportHelpCards() {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const stacked = width < STACK_BREAKPOINT;
  const illusW = stacked ? 112 : 128;
  const illusH = stacked ? 92 : 104;

  const openHelpCenter = () => {
    const base = webBaseUrl();
    const url = base ? `${base}/help` : "https://pulse.qu.network/help";
    void Linking.openURL(url).catch(() => {});
  };

  const openSupport = () => {
    const base = webBaseUrl();
    const url = base ? `${base}/support` : "mailto:support@qu.network";
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <View
      style={[
        styles.wrap,
        stacked ? styles.wrapStacked : styles.wrapRow,
      ]}
    >
      <HelpCard
        title={t("networkHelpQuestionsTitle")}
        description={t("networkHelpQuestionsBody")}
        ctaLabel={t("networkHelpQuestionsCta")}
        onPress={openHelpCenter}
        illustration={
          <NetworkHelpQuestionsIllustration width={illusW} height={illusH} />
        }
      />
      <HelpCard
        title={t("networkHelpSupportTitle")}
        description={t("networkHelpSupportBody")}
        ctaLabel={t("networkHelpSupportCta")}
        onPress={openSupport}
        illustration={
          <NetworkHelpSupportIllustration width={illusW} height={illusH} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 20,
    marginBottom: 8,
    gap: 16,
  },
  wrapRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  wrapStacked: {
    flexDirection: "column",
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 22,
    paddingRight: 12,
    paddingTop: 22,
    paddingBottom: 14,
    minHeight: 132,
  },
  cardTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    paddingRight: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  cardDescription: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 18,
    maxWidth: 280,
  },
  cardIllustration: {
    width: 128,
    height: 104,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "visible",
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 0,
  },
  cardCtaRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardCtaPressed: {
    backgroundColor: "rgba(79, 70, 229, 0.04)",
  },
  cardCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
});
