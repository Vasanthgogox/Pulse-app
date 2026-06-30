/**
 * Professional bio + core intel + synergy — matches public profile preview layout.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import Theme from "@/constants/Theme";
import { publicProfileMobileStyles as mobileS } from "@/features/party/components/publicProfileMobile.styles";
import type { PublicProfileEntity, PublicProfileFact } from "@/features/public-profile/types";
import Layout from "@/constants/Layout";
import { StyleSheet, Text, View } from "react-native";

function asDisplay(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : "No data";
}

const FACT_ICON_MAP: Record<
  PublicProfileFact["icon"],
  React.ComponentProps<typeof FontAwesome>["name"]
> = {
  industry: "briefcase",
  location: "map-marker",
  phone: "phone",
  email: "envelope-o",
  calendar: "calendar-o",
  id: "id-card-o",
  briefcase: "briefcase",
  truck: "truck",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, mobileS.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

function FactRow({ fact, isLast }: { fact: PublicProfileFact; isLast: boolean }) {
  const iconName = FACT_ICON_MAP[fact.icon];
  return (
    <View style={[styles.factRow, mobileS.factRow, !isLast && styles.factRowDivider]}>
      <View style={[styles.factIconWrap, mobileS.factIconWrap]}>
        <FontAwesome name={iconName} size={14} color={Theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.factLabel, mobileS.factLabel]}>{fact.label.toUpperCase()}</Text>
        <Text style={[styles.factValue, mobileS.factValue]} numberOfLines={3}>
          {asDisplay(fact.value)}
        </Text>
      </View>
    </View>
  );
}

function SynergyCard({ entity }: { entity: PublicProfileEntity }) {
  if (!entity.synergyHeadline) return null;

  return (
    <View style={[styles.synergyCard, mobileS.synergyCard]}>
      <LinearGradient
        colors={["#020617", "#0F172A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.synergyGlow} />
      <View style={styles.synergyAccentBar} />
      <View style={styles.synergyHeaderRow}>
        <View style={styles.synergyLeadRow}>
          <FontAwesome name="bolt" size={14} color={Theme.primaryLight} />
          <Text style={styles.synergyEyebrow}>NETWORK LOCK-IN</Text>
        </View>
        {entity.isIntegrated ? (
          <View style={styles.verifiedPartnerBadge}>
            <Text style={styles.verifiedPartnerText}>VERIFIED PARTNER</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.synergyHeadline, mobileS.synergyHeadline]}>
        {entity.synergyHeadline}
      </Text>
      {entity.synergyBody ? (
        <Text style={[styles.synergyBody, mobileS.synergyBody]}>{entity.synergyBody}</Text>
      ) : null}
    </View>
  );
}

type Props = {
  entity: PublicProfileEntity;
};

export function PartyProfileIntelSections({ entity }: Props) {
  return (
    <View style={styles.content}>
      <Section title="Professional Bio">
        <View style={[styles.bioCard, mobileS.bioCard]}>
          <Text style={[styles.bioQuoteMark, mobileS.bioQuoteMark]}>"</Text>
          <Text style={[styles.bioText, mobileS.bioText]}>{asDisplay(entity.bio)}</Text>
        </View>
      </Section>

      <Section title="Core Intel">
        <View style={[styles.factList, mobileS.factList]}>
          {entity.facts.length > 0 ? (
            entity.facts.map((fact, idx) => (
              <FactRow
                key={`${fact.icon}-${fact.label}-${idx}`}
                fact={fact}
                isLast={idx === entity.facts.length - 1}
              />
            ))
          ) : (
            <View style={styles.noDataRow}>
              <Text style={styles.noDataText}>No data</Text>
            </View>
          )}
        </View>
      </Section>

      {entity.entityType !== "driver" ? <SynergyCard entity={entity} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
    backgroundColor: Theme.screenBackground,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    letterSpacing: 1.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  bioCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  bioQuoteMark: {
    fontSize: 32,
    lineHeight: 24,
    fontWeight: "700",
    color: Theme.primary,
    marginBottom: 4,
  },
  bioText: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textSecondary,
    lineHeight: 19,
  },
  factList: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  factRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  factIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F5F8FA",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  factLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.1,
    color: Theme.textMuted,
    marginBottom: 2,
  },
  factValue: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  noDataRow: {
    padding: 16,
    alignItems: "center",
  },
  noDataText: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  synergyCard: {
    borderRadius: 14,
    padding: 14,
    overflow: "hidden",
    minHeight: 120,
    gap: 6,
  },
  synergyGlow: {
    position: "absolute",
    top: -40,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(99, 102, 241, 0.25)",
  },
  synergyAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Theme.primary,
  },
  synergyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  synergyLeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  synergyEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: Theme.primaryLight,
  },
  verifiedPartnerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.45)",
  },
  verifiedPartnerText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#E9D5FF",
  },
  synergyHeadline: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  synergyBody: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(226, 232, 240, 0.88)",
    lineHeight: 17,
  },
});
