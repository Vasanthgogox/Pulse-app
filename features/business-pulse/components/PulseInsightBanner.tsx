import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Sparkles } from "lucide-react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

export type PulseInsightParty = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
};

type Props = {
  parties: PulseInsightParty[];
  title?: string;
  body?: string;
  ctaLabel?: string;
  onPress?: () => void;
};

/** Metronic-style insight rail — stacked avatars + narrative CTA. */
export function PulseInsightBanner({
  parties,
  title = "Cross-filter intelligence",
  body = "Tap cities, KPIs, or table rows to narrow scope. Insights stay synced across domains.",
  ctaLabel = "Open drilldown",
  onPress,
}: Props) {
  const visible = parties.slice(0, 4);

  return (
    <View style={[ent.surfaceCard, styles.wrap]}>
      <View style={styles.content}>
        {visible.length > 0 ? (
          <View style={styles.avatarStack}>
            {visible.map((party, index) => (
              <View
                key={party.id}
                style={[styles.avatarSlot, index > 0 && { marginLeft: -10 }]}
              >
                <PartyAvatar
                  name={party.name}
                  initialsColorSeed={party.id}
                  avatarUrl={party.avatarUrl}
                  avatarSeed={party.avatarSeed}
                  entityType="client"
                  size={34}
                  shape="circle"
                  style={styles.avatarBorder}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.sparkleChip}>
            <Sparkles size={16} color={Theme.primary} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.cta, pressed && onPress && styles.ctaPressed]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <ChevronRight size={14} color={Theme.primary} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 0,
    marginTop: 4,
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
    flexShrink: 0,
  },
  avatarSlot: {
    zIndex: 1,
  },
  avatarBorder: {
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  sparkleChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: Theme.borderLight,
    marginTop: 14,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
  },
  ctaPressed: {
    opacity: 0.75,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
});
