import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { MoreVertical, Share2 } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import {
    Alert,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";

import type {
    PublicProfileEntity,
    PublicProfileFact,
    PublicProfileMetric,
} from "../types";

interface PublicProfileScreenProps {
  entity: PublicProfileEntity | null;
  loading: boolean;
  errorMessage: string | null;
  onBack: () => void;
}

/** Hero block height (excludes status bar; identity overlaps scroll content). */
const HERO_HEIGHT = 256;
const METRICS_OVERLAP = 56;

function asDisplay(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : "No data";
}

/**
 * Premium, modern "public preview" profile for clients, suppliers, and drivers.
 *
 * Layout mirrors the reference mock: dark cinematic hero → floating metric
 * island → quote-style bio → faceted "Core Intel" list → synergy CTA card.
 */
export default function PublicProfileScreen({
  entity,
  loading,
  errorMessage,
  onBack,
}: PublicProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (loading) {
    return <CenteredLoadingView />;
  }

  if (errorMessage || !entity) {
    return (
      <View style={[styles.errorWrap, { paddingTop: insets.top + 24 }]}>
        <TouchableOpacity
          style={styles.errorBackBtn}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
        <View style={styles.errorCard}>
          <FontAwesome name="exclamation-circle" size={32} color={Theme.warning} />
          <Text style={styles.errorTitle}>PROFILE UNAVAILABLE</Text>
          <Text style={styles.errorBody}>
            {errorMessage ?? "This entity could not be loaded."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 64 }}
      >
        <Hero
          entity={entity}
          insetsTop={insets.top}
          onBack={onBack}
        />

        {/* Content area — floating island overlaps the hero */}
        <View
          style={[
            styles.content,
            {
              marginTop: -METRICS_OVERLAP,
              paddingTop: METRICS_OVERLAP + 12,
            },
          ]}
        >
          <MetricIsland metrics={entity.metrics} />

          <Section title="Professional Bio">
            <View style={styles.bioCard}>
              <Text style={styles.bioQuoteMark}>"</Text>
              <Text style={styles.bioText}>
                {asDisplay(entity.bio)}
              </Text>
            </View>
          </Section>

          <Section title="Core Intel">
            <View style={styles.factList}>
              {entity.facts.length > 0 ? (
                entity.facts.map((fact, idx) => (
                  <FactRow
                    key={`${fact.icon}-${idx}`}
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

          {entity.entityType !== "driver" && entity.synergyHeadline && (
            <SynergyCard
              entity={entity}
              onPress={() => router.push(entity.fullDetailHref as never)}
            />
          )}

          {entity.entityType === "driver" && (
            <TouchableOpacity
              style={styles.fleetCta}
              activeOpacity={0.9}
              onPress={() => router.push(entity.fullDetailHref as never)}
            >
              <View style={styles.fleetCtaIconWrap}>
                <FontAwesome name="truck" size={18} color={Theme.textOnPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fleetCtaTitle}>{entity.primaryCtaLabel}</Text>
                <Text style={styles.fleetCtaBody}>
                  Trips, settlements, and salary requests live in the full fleet
                  passbook.
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color={Theme.textOnPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/* ──────────────────────────────── Hero ──────────────────────────────── */

function Hero({
  entity,
  insetsTop,
  onBack,
}: {
  entity: PublicProfileEntity;
  insetsTop: number;
  onBack: () => void;
}) {
  const typeLabel =
    entity.entityType === "client"
      ? "CLIENT"
      : entity.entityType === "supplier"
        ? "SUPPLIER"
        : "DRIVER";

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${entity.name} — ${typeLabel} on Pulse`,
        title: entity.name,
      });
    } catch {
      /* user dismissed */
    }
  }, [entity.name, typeLabel]);

  const onMore = useCallback(() => {
    Alert.alert("Entity profile", "Additional actions will be available in a later release.", [
      { text: "OK", style: "cancel" },
    ]);
  }, []);

  return (
    <View style={[styles.hero, { minHeight: HERO_HEIGHT + insetsTop }]}>
      <LinearGradient
        colors={["#0F172A", "#0B1026", "#1E1B4B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroGlow} />

      <View style={[styles.heroTopBar, { marginTop: insetsTop + 8 }]}>
        <TouchableOpacity
          style={styles.heroChipBtn}
          onPress={onBack}
          activeOpacity={0.75}
          accessibilityLabel="Back"
        >
          <FontAwesome name="chevron-left" size={16} color={Theme.textOnDark} />
        </TouchableOpacity>
        <View style={styles.heroTopRightGroup}>
          <TouchableOpacity
            style={styles.heroChipBtn}
            onPress={onShare}
            activeOpacity={0.75}
            accessibilityLabel="Share profile"
          >
            <Share2 size={18} color={Theme.textOnDark} strokeWidth={2.2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroChipBtn}
            onPress={onMore}
            activeOpacity={0.75}
            accessibilityLabel="More options"
          >
            <MoreVertical size={18} color={Theme.textOnDark} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Avatar + role pills in one row (target); name below. */}
      <View style={styles.heroIdentityBlock}>
        <View style={styles.heroIdentityRow}>
          <View style={styles.avatarFrame}>
            <PartyAvatar
              name={entity.name}
              avatarUrl={entity.avatarUrl}
              avatarSeed={entity.avatarSeed ?? null}
              entityType={entity.entityType}
              size={82}
              borderStyle={styles.avatarImage}
            />
            {entity.isVerified && (
              <View style={styles.verifiedBadge}>
                <FontAwesome name="check" size={10} color={Theme.textOnPrimary} />
              </View>
            )}
          </View>
          <View style={styles.heroPillsStack}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{typeLabel}</Text>
              </View>
              {entity.isIntegrated ? (
                <View style={[styles.typeBadge, styles.activeBadge]}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeBadgeText}>ACTIVE ON APP</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <Text
          style={styles.heroName}
          numberOfLines={2}
          allowFontScaling={false}
        >
          {entity.name}
        </Text>
        <Text style={styles.heroSubtitle} numberOfLines={1}>
          {asDisplay(entity.subtitle)}
        </Text>
      </View>
    </View>
  );
}

/* ───────────────────────── Metric Island ───────────────────────── */

function MetricIsland({
  metrics,
}: {
  metrics: readonly PublicProfileMetric[];
}) {
  return (
    <View style={styles.islandShadow}>
      <View style={styles.islandPill}>
        {metrics.map((m, idx) => {
          const tintColor =
            m.tint === "positive"
              ? Theme.positive
              : m.tint === "warning"
                ? Theme.warning
                : m.tint === "negative"
                  ? Theme.negative
                  : Theme.textOnPrimary;
          return (
            <View
              key={`${m.label}-${idx}`}
              style={[
                styles.islandCell,
                idx < metrics.length - 1 && styles.islandCellDivider,
              ]}
            >
              <Text style={styles.islandLabel}>{m.label}</Text>
              <View style={styles.islandValueRow}>
                <Text
                  style={[styles.islandValue, { color: tintColor }]}
                  numberOfLines={1}
                >
                  {asDisplay(m.value)}
                </Text>
                {m.suffix ? (
                  <Text style={[styles.islandSuffix, { color: tintColor }]}>
                    {m.suffix}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ───────────────────────── Section + Facts ───────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
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

function FactRow({ fact, isLast }: { fact: PublicProfileFact; isLast: boolean }) {
  const iconName = FACT_ICON_MAP[fact.icon];
  return (
    <View style={[styles.factRow, !isLast && styles.factRowDivider]}>
      <View style={styles.factIconWrap}>
        <FontAwesome name={iconName} size={16} color={Theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.factLabel}>{fact.label.toUpperCase()}</Text>
        <Text style={styles.factValue} numberOfLines={2}>
          {asDisplay(fact.value)}
        </Text>
      </View>
    </View>
  );
}

/* ───────────────────────── Synergy Card ───────────────────────── */

function SynergyCard({
  entity,
  onPress,
}: {
  entity: PublicProfileEntity;
  onPress: () => void;
}) {
  const handlePress = useMemo(() => onPress, [onPress]);
  return (
    <View style={styles.synergyCard}>
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
        {entity.isIntegrated && (
          <View style={styles.verifiedPartnerBadge}>
            <Text style={styles.verifiedPartnerText}>VERIFIED PARTNER</Text>
          </View>
        )}
      </View>

      <Text style={styles.synergyHeadline}>{entity.synergyHeadline}</Text>
      {entity.synergyBody ? (
        <Text style={styles.synergyBody}>{entity.synergyBody}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.synergyCta}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <Text style={styles.synergyCtaText}>{entity.primaryCtaLabel}</Text>
        <View style={styles.synergyCtaIconWrap}>
          <FontAwesome
            name="arrow-right"
            size={14}
            color={Theme.cinematicHeaderBg}
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },

  /* Error */
  errorWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 24,
  },
  errorBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  errorCard: {
    marginTop: 48,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
    color: Theme.textPrimary,
    marginTop: 4,
  },
  errorBody: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  /* Hero — midnight indigo; identity overlaps first cards */
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    overflow: "visible",
  },
  heroGlow: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: Theme.primaryLight ?? "#6366F1",
    opacity: 0.35,
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroTopRightGroup: {
    flexDirection: "row",
    gap: 10,
  },
  heroChipBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroIdentityBlock: {
    marginTop: 12,
    paddingBottom: 4,
  },
  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroPillsStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  avatarFrame: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: Theme.textOnPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 14,
  },
  avatarImage: {
    width: 82,
    height: 82,
    borderRadius: 16,
    borderWidth: 0,
  },
  avatarInitials: {
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.cinematicHeaderBg,
    letterSpacing: -1,
  },
  verifiedBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Theme.cinematicHeaderBg,
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: Theme.textOnPrimary,
  },
  activeBadge: {
    backgroundColor: Theme.darkGreen,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: Theme.textOnPrimary,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
    letterSpacing: -0.4,
    lineHeight: 28,
    marginTop: 14,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.5,
  },

  /* Content wrapper — paddingTop from METRICS_OVERLAP in component */
  content: {
    paddingHorizontal: 20,
    gap: 28,
  },

  /* Metric strip — single dark pill (TRUST TIER / TENURE / SYNC STATE) */
  islandShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  islandPill: {
    flexDirection: "row",
    borderRadius: 20,
    backgroundColor: Theme.feedbackModalHeaderDriver,
    paddingVertical: 18,
    paddingHorizontal: 6,
  },
  islandCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  islandCellDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(255,255,255,0.12)",
  },
  islandLabel: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: Theme.textSection,
  },
  islandValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  islandValue: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.3,
  },
  islandSuffix: {
    fontSize: 11,
    fontWeight: "900",
  },

  /* Section */
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3.2,
    color: Theme.textSecondary,
    paddingHorizontal: 6,
    textTransform: "uppercase",
  },

  /* Bio */
  bioCard: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
  },
  bioQuoteMark: {
    fontSize: 44,
    lineHeight: 30,
    fontWeight: "900",
    color: Theme.primary,
    marginBottom: 6,
  },
  bioText: {
    fontSize: 15,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
    lineHeight: 22,
  },

  /* Facts */
  factList: {
    backgroundColor: Theme.textOnPrimary,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  factRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.cinematicDivider,
  },
  factIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  factLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: Theme.textSecondary,
    marginBottom: 2,
  },
  factValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  noDataRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  noDataText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  /* Synergy */
  synergyCard: {
    borderRadius: 32,
    padding: 26,
    overflow: "hidden",
    backgroundColor: Theme.cinematicHeaderBg,
    shadowColor: Theme.cinematicHeaderBg,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 12,
  },
  synergyGlow: {
    position: "absolute",
    top: -140,
    right: -140,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: Theme.primaryLight ?? "#6366F1",
    opacity: 0.28,
  },
  synergyAccentBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: Theme.primaryLight ?? "#6366F1",
  },
  synergyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  synergyLeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  synergyEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.4,
    color: Theme.primaryLight ?? "#A5B4FC",
  },
  verifiedPartnerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(99,102,241,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  verifiedPartnerText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: "#C7D2FE",
  },
  synergyHeadline: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
    letterSpacing: -0.5,
    lineHeight: 26,
    marginBottom: 8,
  },
  synergyBody: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    lineHeight: 20,
    marginBottom: 22,
  },
  synergyCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.textOnPrimary,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: 22,
  },
  synergyCtaText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2.6,
    color: Theme.cinematicHeaderBg,
  },
  synergyCtaIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Driver "Open Fleet" CTA */
  fleetCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Theme.cinematicHeaderBg,
    padding: 20,
    borderRadius: 24,
  },
  fleetCtaIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  fleetCtaTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: Theme.textOnPrimary,
    marginBottom: 4,
  },
  fleetCtaBody: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    lineHeight: 16,
  },
});
