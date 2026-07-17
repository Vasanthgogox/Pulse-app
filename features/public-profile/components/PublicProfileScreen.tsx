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
import Theme from "@/constants/Theme";
import {
  NetworkProfileInviteHero,
  NetworkProfileInviteStats,
} from "@/features/network/components/NetworkProfileInviteHero";
import { networkProfileInviteStyles as inviteS } from "@/features/network/components/networkProfileInvite.styles";
import {
  partyAccentFromConnectionRole,
  type PartyRoleLabel,
} from "@/lib/partyEntityAccent";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { publicProfileMobileStyles as mobileS } from "@/features/party/components/publicProfileMobile.styles";

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
  const compact = useProfileHubCompact();

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
        contentContainerStyle={{ paddingBottom: insets.bottom + (compact ? 48 : 64) }}
      >
        <Hero
          entity={entity}
          insetsTop={insets.top}
          onBack={onBack}
          compact={compact}
        />

        <View style={[styles.content, compact && mobileS.content]}>
          <Section title="Professional Bio" compact={compact}>
            <View style={[styles.bioCard, compact && mobileS.bioCard]}>
              <Text style={[styles.bioQuoteMark, compact && mobileS.bioQuoteMark]}>"</Text>
              <Text style={[styles.bioText, compact && mobileS.bioText]}>
                {asDisplay(entity.bio)}
              </Text>
            </View>
          </Section>

          <Section title="Core Intel" compact={compact}>
            <View style={[styles.factList, compact && mobileS.factList]}>
              {entity.facts.length > 0 ? (
                entity.facts.map((fact, idx) => (
                  <FactRow
                    key={`${fact.icon}-${idx}`}
                    fact={fact}
                    isLast={idx === entity.facts.length - 1}
                    compact={compact}
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
              compact={compact}
              onPress={() => router.push(entity.fullDetailHref as never)}
            />
          )}

          {entity.entityType === "driver" && (
            <TouchableOpacity
              style={[styles.fleetCta, compact && mobileS.fleetCta]}
              activeOpacity={0.9}
              onPress={() => router.push(entity.fullDetailHref as never)}
            >
              <View style={styles.fleetCtaIconWrap}>
                <FontAwesome name="truck" size={18} color={Theme.textOnPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fleetCtaTitle, compact && mobileS.fleetCtaTitle]}>
                  {entity.primaryCtaLabel}
                </Text>
                <Text style={[styles.fleetCtaBody, compact && mobileS.fleetCtaBody]}>
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

function entityTypeToRole(entityType: PublicProfileEntity["entityType"]): PartyRoleLabel {
  if (entityType === "supplier") return "SUPPLIER";
  if (entityType === "driver") return "DRIVER";
  return "CLIENT";
}

function ratingFromMetrics(metrics: readonly PublicProfileMetric[]): {
  display: string;
  empty: boolean;
} {
  const ratingMetric = metrics.find(
    (m) =>
      m.suffix === "★" ||
      /rating/i.test(m.label) ||
      /trust/i.test(m.label),
  );
  if (!ratingMetric) return { display: "No rating", empty: true };
  const raw = asDisplay(ratingMetric.value);
  if (raw === "No data" || raw === "—") return { display: "No rating", empty: true };
  const suffix = ratingMetric.suffix ?? "";
  return {
    display: suffix ? `${raw}${suffix}` : raw,
    empty: false,
  };
}

function Hero({
  entity,
  insetsTop,
  onBack,
  compact,
}: {
  entity: PublicProfileEntity;
  insetsTop: number;
  onBack: () => void;
  compact: boolean;
}) {
  const roleLabel = entityTypeToRole(entity.entityType);
  const accent = partyAccentFromConnectionRole(roleLabel);
  const { display: ratingDisplay, empty: ratingEmpty } = ratingFromMetrics(entity.metrics);
  const linkLabel = entity.isIntegrated ? "ON PLATFORM" : "PUBLIC";
  const linkLive = entity.isIntegrated;

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${entity.name} — ${roleLabel} on Pulse`,
        title: entity.name,
      });
    } catch {
      /* user dismissed */
    }
  }, [entity.name, roleLabel]);

  const onMore = useCallback(() => {
    Alert.alert("Entity profile", "Additional actions will be available in a later release.", [
      { text: "OK", style: "cancel" },
    ]);
  }, []);

  const statItems = entity.metrics.map((m) => ({
    label: m.label.toUpperCase(),
    value: `${asDisplay(m.value)}${m.suffix ?? ""}`,
    live: m.tint === "positive",
  }));

  const metaChips = useMemo(() => {
    if (!entity.isIntegrated) return [];
    return [{ label: "Verified partner" }];
  }, [entity.isIntegrated]);

  return (
    <View style={[styles.heroShell, { paddingTop: insetsTop + (compact ? 4 : 8) }, compact && mobileS.heroShell]}>
      <View style={[styles.heroTopBar, compact && mobileS.heroTopBar]}>
        <TouchableOpacity
          style={[styles.heroChipBtnLight, compact && mobileS.heroChipBtn]}
          onPress={onBack}
          activeOpacity={0.75}
          accessibilityLabel="Back"
        >
          <FontAwesome name="chevron-left" size={16} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
        <View style={styles.heroTopRightGroup}>
          <TouchableOpacity
            style={[styles.heroChipBtnLight, compact && mobileS.heroChipBtn]}
            onPress={onShare}
            activeOpacity={0.75}
            accessibilityLabel="Share profile"
          >
            <Share2 size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroChipBtnLight, compact && mobileS.heroChipBtn]}
            onPress={onMore}
            activeOpacity={0.75}
            accessibilityLabel="More options"
          >
            <MoreVertical size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.heroCardWrap, { borderColor: accent.ring }, compact && mobileS.heroCardWrap]}>
        <NetworkProfileInviteHero
          name={entity.name}
          subtitle={
            entity.facts.find((f) => f.icon === "location")?.value?.trim() ||
            asDisplay(entity.subtitle)
          }
          roleLabel={roleLabel}
          linkLabel={linkLabel}
          linkLive={linkLive}
          ratingDisplay={ratingDisplay}
          ratingEmpty={ratingEmpty}
          entityType={entity.entityType}
          avatarUrl={entity.avatarUrl}
          avatarSeed={entity.avatarSeed}
          showVerified={entity.isVerified}
          metaChips={metaChips}
          avatarSize={compact ? 68 : 86}
          compact={compact}
          style={inviteS.card}
          footer={<NetworkProfileInviteStats items={statItems} compact={compact} />}
        />
      </View>
    </View>
  );
}

/* ───────────────────────── Section + Facts ───────────────────────── */

function Section({
  title,
  children,
  compact,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, compact && mobileS.sectionTitle]}>{title}</Text>
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

function FactRow({
  fact,
  isLast,
  compact,
}: {
  fact: PublicProfileFact;
  isLast: boolean;
  compact?: boolean;
}) {
  const iconName = FACT_ICON_MAP[fact.icon];
  return (
    <View style={[styles.factRow, !isLast && styles.factRowDivider, compact && mobileS.factRow]}>
      <View style={[styles.factIconWrap, compact && mobileS.factIconWrap]}>
        <FontAwesome name={iconName} size={compact ? 14 : 16} color={Theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.factLabel, compact && mobileS.factLabel]}>{fact.label.toUpperCase()}</Text>
        <Text style={[styles.factValue, compact && mobileS.factValue]} numberOfLines={2}>
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
  compact,
}: {
  entity: PublicProfileEntity;
  onPress: () => void;
  compact?: boolean;
}) {
  const handlePress = useMemo(() => onPress, [onPress]);
  return (
    <View style={[styles.synergyCard, compact && mobileS.synergyCard]}>
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

      <Text style={[styles.synergyHeadline, compact && mobileS.synergyHeadline]}>
        {entity.synergyHeadline}
      </Text>
      {entity.synergyBody ? (
        <Text style={[styles.synergyBody, compact && mobileS.synergyBody]}>{entity.synergyBody}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.synergyCta, compact && mobileS.synergyCta]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <Text style={[styles.synergyCtaText, compact && mobileS.synergyCtaText]}>
          {entity.primaryCtaLabel}
        </Text>
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

  heroShell: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Theme.screenBackground,
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroTopRightGroup: {
    flexDirection: "row",
    gap: 10,
  },
  heroChipBtnLight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  heroCardWrap: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: Theme.screenBackground,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 22,
  },

  /* Section */
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    letterSpacing: 1.8,
    color: Theme.textMutedDemo,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },

  /* Bio */
  bioCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
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
    backgroundColor: Theme.screenBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
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
    backgroundColor: Theme.primaryLight ?? Theme.pulseIndigo,
    opacity: 0.28,
  },
  synergyAccentBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: Theme.primaryLight ?? Theme.pulseIndigo,
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
