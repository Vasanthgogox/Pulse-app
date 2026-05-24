import { LEVELS_CONFIG } from "@/constants/DriverLevels";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useAvatar, DEFAULT_USER_2D_AVATAR_SEED } from "@/lib/useAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { EditProfileModal } from "@/features/auth";
import {
  averageScore,
  getRatingsForClients,
  getRatingsReceivedAsLinkedOrganization,
} from "@/features/ratings/services/ratings.service";
import { getSignedAvatarUrl, pickAndUploadOrgLogo, updateOrganizationLogo } from "@/lib/avatarUpload";
import { PartyAvatar } from "@/components/PartyAvatar";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { useRealtimeTripsInvalidation } from "@/lib/queries/useRealtimeInvalidation";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    BarChart3,
    ChevronLeft,
    Crown,
    MapPin,
    MousePointer2,
    Star,
    Trophy,
    Truck,
    Users,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Image,
    Linking,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SLATE_900 = "#0f172a";
const AMBER_400 = "#fbbf24";
const AMBER_500 = "#f59e0b";

/** Commercial ops tiers — same trip thresholds as driver road map (parity). */
const BUSINESS_ROADMAP = [
  { tier: "Rookie", minTrips: 0, dot: Theme.textMuted },
  { tier: "Pro", minTrips: 200, dot: "#3b82f6" },
  { tier: "Veteran", minTrips: 1000, dot: AMBER_500 },
  { tier: "Elite", minTrips: 2500, dot: "#9333ea" },
  { tier: "Legend", minTrips: 5000, dot: "#0d9488" },
] as const;

function isTripDone(status: string) {
  const s = (status || "").toLowerCase();
  return s === "completed" || s === "delivered" || s === "done";
}

type ProfileViewMode = "main" | "roadmap";

type ProfileItemRowProps = {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value: string;
  onPress?: () => void;
  showChevron?: boolean;
};

function ProfileItemRow({
  icon,
  label,
  value,
  onPress,
  showChevron,
}: ProfileItemRowProps) {
  const content = (
    <>
      <View style={styles.profileItemLeft}>
        <View style={styles.profileItemIconBox}>
          <FontAwesome name={icon} size={16} color={Theme.textMuted} />
        </View>
        <View style={styles.profileItemTextWrap}>
          <Text style={styles.profileItemLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.profileItemValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
      {showChevron ? (
        <FontAwesome name="chevron-right" size={14} color={Theme.textSection} />
      ) : (
        <View style={styles.profileItemRightSpacer} />
      )}
    </>
  );

  if (!onPress) {
    return <View style={styles.profileItemRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileItemRow,
        pressed && styles.profileItemRowPressed,
      ]}
      accessibilityRole="button"
    >
      {({ pressed }) => (
        <View style={styles.profileItemRowInner}>
          <View style={styles.profileItemLeft}>
            <View
              style={[
                styles.profileItemIconBox,
                pressed && styles.profileItemIconBoxPressed,
              ]}
            >
              <FontAwesome
                name={icon}
                size={16}
                color={pressed ? Theme.textOnDark : Theme.textMuted}
              />
            </View>
            <View style={styles.profileItemTextWrap}>
              <Text style={styles.profileItemLabel} numberOfLines={1}>
                {label}
              </Text>
              <Text style={styles.profileItemValue} numberOfLines={1}>
                {value}
              </Text>
            </View>
          </View>
          {showChevron ? (
            <FontAwesome
              name="chevron-right"
              size={14}
              color={Theme.textSection}
            />
          ) : (
            <View style={styles.profileItemRightSpacer} />
          )}
        </View>
      )}
    </Pressable>
  );
}

function FleetStars({ value }: { value: number }) {
  const v = Math.round(value * 2) / 2;
  return (
    <View style={styles.fleetStarRow} accessibilityLabel={`${value.toFixed(1)} stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const full = v >= i + 1;
        const half = !full && v >= i + 0.5;
        return (
          <View key={i} style={styles.starSlot}>
            {full || half ? (
              <Star
                size={14}
                color={AMBER_400}
                fill={full ? AMBER_400 : "transparent"}
                strokeWidth={2}
              />
            ) : (
              <Star size={14} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
            )}
          </View>
        );
      })}
    </View>
  );
}

type RoadmapPanelProps = {
  completedTrips: number;
  onBack: () => void;
};

function BusinessRoadmapPanel({ completedTrips, onBack }: RoadmapPanelProps) {
  let activeRoadIdx = 0;
  for (let i = BUSINESS_ROADMAP.length - 1; i >= 0; i--) {
    if (completedTrips >= BUSINESS_ROADMAP[i].minTrips) {
      activeRoadIdx = i;
      break;
    }
  }
  const nextRoad = BUSINESS_ROADMAP[activeRoadIdx + 1];
  const cur = BUSINESS_ROADMAP[activeRoadIdx];
  const tierProgressPct = nextRoad
    ? Math.min(
        100,
        Math.round(
          ((completedTrips - cur.minTrips) / Math.max(1, nextRoad.minTrips - cur.minTrips)) *
            100,
        ),
      )
    : 100;

  return (
    <View style={styles.roadmapWrap}>
      <View style={styles.roadmapHeader}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.roadmapBack, pressed && { opacity: 0.85 }]}
          hitSlop={10}
        >
          <ChevronLeft size={22} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.roadmapTitle}>Operations roadmap</Text>
        <View style={{ width: 40 }} />
      </View>
      <LinearGradient colors={["#0f172a", "#020617"]} style={styles.roadmapHero}>
        <View style={styles.roadmapWatermark}>
          <MapPin size={100} color="rgba(255,255,255,0.05)" />
        </View>
        <View style={styles.rankRow}>
          <LinearGradient colors={[AMBER_500, "#d97706"]} style={styles.crownBox}>
            <Crown size={26} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.roadmapEyebrow}>CURRENT TIER</Text>
            <Text style={styles.roadmapTierName}>{cur.tier}</Text>
          </View>
        </View>
        {nextRoad ? (
          <View style={styles.roadmapProgBlock}>
            <View style={styles.roadmapProgLabels}>
              <Text style={styles.roadmapProgLeft}>Progress to {nextRoad.tier}</Text>
              <Text style={styles.roadmapProgPct}>{tierProgressPct}%</Text>
            </View>
            <View style={styles.roadmapTrack}>
              <View
                style={[styles.roadmapFill, { width: `${tierProgressPct}%` }]}
              />
            </View>
            <Text style={styles.roadmapSmall}>
              {completedTrips} completed trips · next milestone {nextRoad.minTrips}
            </Text>
          </View>
        ) : (
          <Text style={styles.roadmapSmall}>You have reached the top tier. Keep the grid moving.</Text>
        )}
        <View style={styles.roadmapSteps}>
          {BUSINESS_ROADMAP.map((step, i) => {
            const past = i < activeRoadIdx;
            const active = i === activeRoadIdx;
            return (
              <View key={step.tier} style={styles.roadmapStepRow}>
                <View
                  style={[
                    styles.roadmapDot,
                    past && { backgroundColor: "#10b981" },
                    active && { backgroundColor: AMBER_400 },
                    !past && !active && { backgroundColor: "#475569" },
                  ]}
                />
                <View style={styles.roadmapStepText}>
                  <Text style={styles.roadmapStepTitle}>{step.tier}</Text>
                  <Text style={styles.roadmapStepSub}>{step.minTrips}+ trips</Text>
                </View>
              </View>
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentOrganization, refreshOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { signOut, user, profile, refreshSession } = useAuth();

  const { data: trips = [], isLoading: tripsLoading } = useTripsQuery(orgId);
  useRealtimeTripsInvalidation(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);

  const clientIds = useMemo(() => clients.map((c) => c.id).filter(Boolean), [clients]);
  const clientIdsKey = clientIds.length ? clientIds.sort().join(",") : "";

  /** Supplier/org ratings of your CRM customer records (rated_type client) — not driver scores. */
  const { data: partnerClientRatingData, isLoading: partnerRatingsLoading } = useQuery({
    queryKey: ["q", "profile", "partnerClientRatings", orgId ?? "", clientIdsKey],
    queryFn: async () => {
      if (!orgId || clientIds.length === 0) {
        return { avg: null as number | null, count: 0 };
      }
      const { error, byClientId } = await getRatingsForClients(clientIds);
      if (error) throw error;
      const all = Object.values(byClientId).flat();
      return {
        avg: averageScore(all),
        count: all.length,
      };
    },
    enabled: !!orgId && clientIds.length > 0,
    staleTime: 0,
    refetchOnMount: true,
  });

  /** Partner orgs rated your linked customer identity (integrated client row → your org). */
  const { data: receivedCustomerRatingData, isLoading: receivedCustomerRatingsLoading } = useQuery({
    queryKey: ["q", "profile", "receivedCustomerRatings", orgId ?? ""],
    queryFn: async () => {
      if (!orgId) {
        return { avg: null as number | null, count: 0 };
      }
      const { error, ratings } = await getRatingsReceivedAsLinkedOrganization(orgId);
      if (error) throw error;
      return {
        avg: averageScore(ratings),
        count: ratings.length,
      };
    },
    enabled: !!orgId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const completedTrips = useMemo(
    () => (trips ?? []).filter((t) => isTripDone(t.status ?? "")).length,
    [trips],
  );

  const currentLevel = useMemo(
    () => Math.min(1 + Math.floor(completedTrips / 2), 8),
    [completedTrips],
  );
  const currentLevelConfig =
    LEVELS_CONFIG.find((l) => l.level === currentLevel) ?? LEVELS_CONFIG[0];
  const nextLevelConfig = LEVELS_CONFIG.find((l) => l.level === currentLevel + 1);

  const experiencePct = useMemo(() => {
    const nextTarget = nextLevelConfig?.type === "trips" ? nextLevelConfig.target : 0;
    if (nextTarget > 0) {
      return Math.min(100, Math.floor((completedTrips / nextTarget) * 100));
    }
    return nextLevelConfig ? 0 : 100;
  }, [nextLevelConfig, completedTrips]);

  const [viewMode, setViewMode] = useState<ProfileViewMode>("main");
  const [avatarSeed, setAvatarSeed] = useState(profile?.avatar_seed ?? '');

  useEffect(() => {
    if (profile?.avatar_seed) {
      setAvatarSeed(profile.avatar_seed);
    }
  }, [profile?.avatar_seed]);

  const { imageUri: avatarUri } = useAvatar({
    type: 'user',
    name: (profile?.full_name ?? profile?.displayName ?? '').trim(),
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_seed?.trim() || DEFAULT_USER_2D_AVATAR_SEED,
  });

  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);
  const [orgLogoUploading, setOrgLogoUploading] = useState(false);

  const capabilities = getCapabilitiesFromProfile(profile);
  const hasDispatcherOrFleetAccess =
    capabilities.includes("finance_view") ||
    capabilities.includes("finance_manage") ||
    capabilities.includes("dispatch") ||
    capabilities.includes("dispatch_for_own_fleet");

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  };

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSession();
      if (orgId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
        await queryClient.invalidateQueries({
          queryKey: ["q", "profile", "partnerClientRatings", orgId],
        });
        await queryClient.invalidateQueries({
          queryKey: ["q", "profile", "receivedCustomerRatings", orgId],
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [orgId, queryClient, refreshSession]);

  useFocusEffect(
    useCallback(() => {
      if (!orgId) return;
      void queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "q" &&
          q.queryKey[1] === "profile",
      });
    }, [orgId, queryClient]),
  );

  const handleEditProfile = () => {
    setShowEditProfileModal(true);
  };

  const openSignOutConfirm = () => {
    if (signOutLoading) return;
    setShowSignOutConfirm(true);
  };

  const closeSignOutConfirm = () => {
    if (signOutLoading) return;
    setShowSignOutConfirm(false);
  };

  const confirmSignOut = async () => {
    if (signOutLoading) return;
    setSignOutLoading(true);
    try {
      await signOut();
      setShowSignOutConfirm(false);
      router.replace(ROUTES.SIGN_IN_DIRECT);
    } finally {
      setSignOutLoading(false);
    }
  };

  const displayName =
    profile?.full_name ||
    profile?.displayName ||
    user?.email?.split("@")[0] ||
    "User";
  const roleLabel = profile?.aggregated
    ? "Dispatcher + Fleet Owner"
    : "Fleet User";
  const email = user?.email ?? "—";
  const phone = profile?.phone ?? "Not added";
  const companyName = profile?.company_name ?? "Not added";
  const accessLabel = useMemo(
    () =>
      hasDispatcherOrFleetAccess
        ? "Operational Access Enabled"
        : "Limited Access",
    [hasDispatcherOrFleetAccess],
  );

  const handleDialPhone = async () => {
    if (phone === "Not added") return;
    const normalized = phone.replace(/[^\d+]/g, "");
    if (!normalized) {
      Alert.alert("Unable to call", "No valid phone number.");
      return;
    }
    const url = `tel:${normalized}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Unable to call",
        "Phone calls are not available on this device (for example, a simulator) or the number could not be opened.",
      );
    }
  };
  const statusText =
    profile?.status_text?.trim() || "Hey there! I am using Q Mobile.";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    "—";

  const partnerClientAvg = partnerClientRatingData?.avg ?? null;
  const partnerClientCount = partnerClientRatingData?.count ?? 0;

  const receivedCustomerAvg = receivedCustomerRatingData?.avg ?? null;
  const receivedCustomerCount = receivedCustomerRatingData?.count ?? 0;

  /** Weighted average of partner ratings: you as customer + your customers (CRM). */
  const combinedPartnerStats = useMemo(() => {
    let sumScore = 0;
    let total = 0;
    if (receivedCustomerCount > 0 && receivedCustomerAvg != null) {
      sumScore += receivedCustomerAvg * receivedCustomerCount;
      total += receivedCustomerCount;
    }
    if (partnerClientCount > 0 && partnerClientAvg != null) {
      sumScore += partnerClientAvg * partnerClientCount;
      total += partnerClientCount;
    }
    if (total === 0) return { avg: null as number | null, count: 0 };
    return { avg: sumScore / total, count: total };
  }, [
    receivedCustomerAvg,
    receivedCustomerCount,
    partnerClientAvg,
    partnerClientCount,
  ]);

  const showCombinedPartnerStars =
    combinedPartnerStats.avg != null &&
    combinedPartnerStats.avg > 0 &&
    combinedPartnerStats.count > 0;

  const statMiddleAvg = combinedPartnerStats.avg;
  const statMiddleLabel = "PARTNER AVG";
  const statMiddleLoading =
    !!orgId &&
    (receivedCustomerRatingsLoading ||
      (clientIds.length > 0 && partnerRatingsLoading));
  const showStatMiddleStars =
    statMiddleAvg != null && statMiddleAvg > 0;

  useEffect(() => {
    let mounted = true;
    const raw = currentOrganization?.logo_url?.trim();
    if (!raw) {
      setOrgLogoUri(null);
      return;
    }
    (async () => {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        if (mounted) setOrgLogoUri(raw);
        return;
      }
      const signed = await getSignedAvatarUrl(raw);
      if (mounted) setOrgLogoUri(signed ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const handleUploadOrgLogo = async () => {
    if (!orgId || orgLogoUploading) return;
    setOrgLogoUploading(true);
    try {
      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        Alert.alert("Upload failed", result.error.message);
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        Alert.alert("Save failed", error.message);
        return;
      }
      if (result.previewUri) setOrgLogoUri(result.previewUri);
      await refreshOrganization();
    } finally {
      setOrgLogoUploading(false);
    }
  };

  return (
    <View style={styles.outer}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Layout.sectionSpacing + layout.scrollBottomPadding(),
          },
        ]}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={Theme.primary}
          />
        }
      >
        {viewMode === "roadmap" ? (
          <View style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}>
            <BusinessRoadmapPanel
              completedTrips={completedTrips}
              onBack={() => setViewMode("main")}
            />
          </View>
        ) : null}

        {viewMode === "main" ? (
          <>
            <View style={[styles.driverLikeTopBar, { paddingTop: insets.top + 8 }]}>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [styles.driverLikeTopBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <ChevronLeft size={20} color={Theme.textOnDark} />
              </Pressable>
              <Text style={styles.driverLikeTopTitle}>PROFILE</Text>
              <Pressable
                onPress={handleEditProfile}
                style={({ pressed }) => [styles.driverLikeTopBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <FontAwesome name="pencil" size={15} color={Theme.textOnDark} />
              </Pressable>
            </View>

            <View style={styles.contentWrapDriverLike}>
              <LinearGradient
                colors={["#0f172a", "#020617"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.driverLikeHero}
              >
                <View style={styles.avatarGlow} />
                <View style={styles.heroAvatarGroup}>
                  {orgLogoUri ? (
                    <Pressable
                      style={({ pressed }) => [styles.orgLogoTouch, pressed && { opacity: 0.85 }]}
                      onPress={() => void handleUploadOrgLogo()}
                      accessibilityRole="button"
                      accessibilityLabel="Change org logo"
                    >
                      <Image source={{ uri: orgLogoUri }} style={styles.orgLogoHero} />
                      <View style={styles.avatarEditBadge}>
                        <FontAwesome name="camera" size={12} color={Theme.textPrimaryDark} />
                      </View>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.avatarTouch,
                      orgLogoUri && styles.avatarTouchSmall,
                      pressed && styles.avatarTouchPressed,
                    ]}
                    onPress={handleEditProfile}
                    accessibilityRole="button"
                  >
                    <View style={[styles.avatarFrame, orgLogoUri && styles.avatarFrameSmall]}>
                      <Image source={{ uri: avatarUri }} style={orgLogoUri ? styles.avatarSmall : styles.avatar} />
                    </View>
                    {!orgLogoUri && (
                      <View style={styles.levelBadgeOnAvatar}>
                        <Trophy size={11} color="#fff" />
                        <Text style={styles.levelBadgeText}>Lv {currentLevel}</Text>
                      </View>
                    )}
                    <View style={[styles.avatarEditBadge, orgLogoUri && styles.avatarEditBadgeSmall]}>
                      <FontAwesome name="camera" size={orgLogoUri ? 10 : 14} color={Theme.textPrimaryDark} />
                    </View>
                  </Pressable>
                </View>

                <Text numberOfLines={1} style={styles.nameText}>
                  {currentOrganization?.name || displayName}
                </Text>
                <Text style={styles.tierKicker} numberOfLines={1}>
                  {orgLogoUri
                    ? displayName
                    : `${currentLevelConfig.tier} · ${currentLevelConfig.name}`}
                </Text>

                <View style={styles.ratingPillsStack}>
                  {showCombinedPartnerStars ? (
                    <View style={[styles.ratingPill, styles.ratingPillPartner]}>
                      <FleetStars value={combinedPartnerStats.avg!} />
                      <Text style={styles.ratingNum}>
                        {combinedPartnerStats.avg!.toFixed(1)} · {combinedPartnerStats.count}{" "}
                        review{combinedPartnerStats.count === 1 ? "" : "s"} (partners · you as
                        customer and your customers)
                      </Text>
                    </View>
                  ) : statMiddleLoading ? (
                    <View style={[styles.ratingPillMuted, styles.ratingPillPartner]}>
                      <LoadingIndicator size="small" color="rgba(255,255,255,0.6)" />
                    </View>
                  ) : (
                    <View style={[styles.ratingPillMuted, styles.ratingPillPartner]}>
                      <Text style={styles.ratingPillMutedText}>
                        No partner ratings yet
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.aboutText} numberOfLines={2}>
                  {statusText}
                </Text>

                <Pressable
                  onPress={() => setViewMode("roadmap")}
                  style={({ pressed }) => [styles.xpCard, pressed && { opacity: 0.92 }]}
                  accessibilityRole="button"
                  accessibilityLabel="View operations roadmap"
                >
                  <View style={styles.xpTop}>
                    <Text style={styles.xpEyebrow}>EXPERIENCE</Text>
                    <Text style={styles.xpPct}>{experiencePct}%</Text>
                  </View>
                  <View style={styles.xpTrack}>
                    <LinearGradient
                      colors={["#10b981", "#0ea5e9"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.xpFill, { width: `${experiencePct}%` }]}
                    />
                  </View>
                  <View style={styles.xpFooter}>
                    <Text style={styles.xpFooterTxt}>
                      {tripsLoading ? "…" : `${completedTrips} trips done`}
                    </Text>
                    <Text style={styles.xpFooterTxt}>
                      {nextLevelConfig?.name ?? "Max rank"} next · tap roadmap
                    </Text>
                  </View>
                </Pressable>
              </LinearGradient>

              <View style={styles.statsGrid}>
                <View style={styles.statTile}>
                  <Truck size={20} color={Theme.primary} />
                  <Text style={styles.statTileNum}>
                    {tripsLoading ? "—" : completedTrips}
                  </Text>
                  <Text style={styles.statTileLbl}>TRIPS</Text>
                </View>
                <View style={styles.statTile}>
                  <Star
                    size={20}
                    color={AMBER_500}
                    fill={showStatMiddleStars ? AMBER_500 : "transparent"}
                  />
                  <Text style={styles.statTileNum}>
                    {statMiddleLoading
                      ? "…"
                      : showStatMiddleStars
                        ? statMiddleAvg!.toFixed(1)
                        : "—"}
                  </Text>
                  <Text style={styles.statTileLbl}>{statMiddleLabel}</Text>
                </View>
                <View style={styles.statTile}>
                  <Users size={20} color="#8b5cf6" />
                  <Text style={styles.statTileNum}>{drivers.length}</Text>
                  <Text style={styles.statTileLbl}>DRIVERS</Text>
                </View>
              </View>

              <View style={styles.premiumCard}>
                <View style={styles.premiumCardInner}>
                  <View style={styles.interactiveRow}>
                    <View style={styles.interactiveRowLeft}>
                      <View style={styles.dashIcon}>
                        <BarChart3 size={20} color={Theme.primary} />
                      </View>
                      <View>
                        <Text style={styles.interactiveEyebrow}>OPERATIONS PULSE</Text>
                        <Text style={styles.interactiveTitle}>Business dashboard</Text>
                        <Text style={styles.interactiveSub}>
                          Trips, fleet reputation, and tier progress update as your team runs loads.
                        </Text>
                      </View>
                    </View>
                    <MousePointer2 size={18} color={Theme.textMuted} />
                  </View>
                </View>
              </View>

              {/* ── Identity navigation split ───────────────────────────── */}
              <View style={styles.premiumCard}>
                <View style={styles.premiumCardInner}>
                  <ProfileItemRow
                    icon="user-circle"
                    label="My Account"
                    value={`${displayName} · personal identity`}
                    onPress={() => router.push('/account')}
                    showChevron
                  />
                  <View style={styles.premiumDivider} />
                  <ProfileItemRow
                    icon="building"
                    label="Company Profile"
                    value={`${currentOrganization?.name ?? 'Workspace'} · logo, KYC, team`}
                    onPress={() => router.push('/company-profile')}
                    showChevron
                  />
                </View>
              </View>

              <View style={styles.premiumCard}>
                <View style={styles.premiumCardInner}>
                  <ProfileItemRow icon="shield" label="Role" value={roleLabel} />
                  <View style={styles.premiumDivider} />
                  <ProfileItemRow icon="key" label="Access" value={accessLabel} />
                </View>
              </View>

              <View style={styles.premiumCard}>
                <View style={styles.premiumCardInner}>
                  <ProfileItemRow
                    icon="users"
                    label="Team Members"
                    value="Invite and manage your team"
                    onPress={() => router.push(ROUTES.MODALS.TEAM as Parameters<typeof router.push>[0])}
                    showChevron
                  />
                </View>
              </View>

              <View style={styles.premiumCard}>
                <View style={styles.premiumCardInner}>
                  <ProfileItemRow
                    icon="file-text-o"
                    label="POD"
                    value="Manage proof of delivery"
                    onPress={() => router.push("/pod-reconciliation")}
                    showChevron
                  />
                  <View style={styles.premiumDivider} />
                  <ProfileItemRow
                    icon="file-text"
                    label="Invoice"
                    value="Execute Invoicing"
                    onPress={() => router.push("/invoicing-execute")}
                    showChevron
                  />
                </View>
              </View>

              <View style={styles.premiumCard}>
                <View style={styles.premiumCardInner}>
                  <ProfileItemRow
                    icon="shield"
                    label="Business Verification"
                    value="KYC · PAN · GSTIN · CIN"
                    onPress={() => router.push("/kyc-settings")}
                    showChevron
                  />
                  <View style={styles.premiumDivider} />
                  <ProfileItemRow
                    icon="cog"
                    label="Invoice Branding"
                    value="Logo & watermark for invoice PDFs"
                    onPress={() => router.push("/branding-settings")}
                    showChevron
                  />
                  <View style={styles.premiumDivider} />
                  <ProfileItemRow
                    icon="info-circle"
                    label="Version"
                    value={`Version ${appVersion} (${buildNumber})`}
                  />
                </View>
              </View>

              <Pressable
                onPress={openSignOutConfirm}
                style={({ pressed }) => [
                  styles.signOutBtn,
                  pressed && styles.signOutBtnPressed,
                ]}
                accessibilityRole="button"
              >
                <FontAwesome
                  name="sign-out"
                  size={16}
                  color={Theme.textOnDark}
                />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>

      <EditProfileModal
        visible={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ""}
        initialPhone={profile?.phone ?? ""}
        initialCompanyName={profile?.company_name ?? ""}
        email={user?.email ?? ""}
        initialStatusText={profile?.status_text ?? ""}
        onPhotoUpdated={async () => {
          await refreshSession();
        }}
        initialAvatarSeed={avatarSeed}
        avatarPresetStyle="user-2d"
        onPresetSelected={(seed) => {
          setAvatarSeed(seed);
        }}
      />
      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={closeSignOutConfirm}
      >
        <View style={styles.signOutConfirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSignOutConfirm} />
          <View style={styles.signOutConfirmCard}>
            <Text style={styles.signOutConfirmTitle}>Sign out</Text>
            <Text style={styles.signOutConfirmBody}>
              Are you sure you want to sign out?
            </Text>
            <View style={styles.signOutConfirmActions}>
              <Pressable
                onPress={closeSignOutConfirm}
                style={({ pressed }) => [
                  styles.signOutConfirmCancelBtn,
                  pressed && styles.signOutConfirmCancelBtnPressed,
                ]}
                accessibilityRole="button"
                disabled={signOutLoading}
              >
                <Text style={styles.signOutConfirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmSignOut()}
                style={({ pressed }) => [
                  styles.signOutConfirmCtaBtn,
                  pressed && styles.signOutConfirmCtaBtnPressed,
                  signOutLoading && styles.signOutConfirmCtaBtnDisabled,
                ]}
                accessibilityRole="button"
                disabled={signOutLoading}
              >
                <Text style={styles.signOutConfirmCtaText}>
                  {signOutLoading ? "Signing out..." : "Sign out"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.screenBackground },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 0,
    gap: 0,
  },
  driverLikeTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    backgroundColor: Theme.cinematicHeaderBg,
  },
  driverLikeTopBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cinematicHeaderChipBg,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  driverLikeTopTitle: {
    ...Typography.headerTitle,
    color: Theme.textOnDark,
    letterSpacing: 2.2,
  },
  contentWrapDriverLike: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    gap: 14,
  },
  driverLikeHero: {
    borderRadius: 38,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: "center",
    overflow: "hidden",
  },

  cinematicHeader: {
    backgroundColor: Theme.cinematicHeaderBg,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 0,
    overflow: "hidden",
  },
  cinematicHeaderBg: {
    ...StyleSheet.absoluteFillObject,
  },
  cinematicHeaderGlow: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: Theme.cinematicGlowRed,
    opacity: 0.5,
  },
  cinematicHeaderMesh: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cinematicHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 4,
  },
  cinematicHeaderTitle: {
    ...Typography.headerTitle,
    color: Theme.textOnDark,
    letterSpacing: 3,
  },
  headerChip: {
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Theme.cinematicHeaderChipBg,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  headerChipPressed: {
    backgroundColor: Theme.cinematicHeaderChipBgPressed,
  },

  heroGradient: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 4,
    paddingBottom: 20,
  },
  profileHero: {
    alignItems: "center",
    paddingTop: 8,
  },
  avatarGlow: {
    position: "absolute",
    top: 8,
    width: 130,
    height: 130,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  heroAvatarGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: Layout.spacingMedium,
  },
  orgLogoTouch: {
    position: "relative",
  },
  orgLogoHero: {
    width: 100,
    height: 100,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.surfaceGray,
  },
  avatarTouchSmall: {
    marginBottom: 0,
  },
  avatarFrameSmall: {
    width: 60,
    height: 60,
    borderRadius: 14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  avatarSmall: {
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surfaceGray,
  },
  avatarEditBadgeSmall: {
    width: 26,
    height: 26,
    borderRadius: 9,
    right: -4,
    bottom: -4,
  },
  orgLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  orgLogoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  orgLogoPreviewWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  orgLogoPreview: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  orgLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: "hidden",
  },
  avatarTouch: { marginBottom: Layout.spacingMedium },
  avatarTouchPressed: { transform: [{ scale: 0.98 }] },
  levelBadgeOnAvatar: {
    position: "absolute",
    left: -4,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0d9488",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: SLATE_900,
  },
  levelBadgeText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  avatarFrame: {
    width: 112,
    height: 112,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: Theme.darkBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  avatar: {
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surfaceGray,
  },
  avatarEditBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.darkBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  nameText: {
    fontSize: 25,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 2,
  },
  tierKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.driverPrimary,
    letterSpacing: 2.4,
    marginBottom: 8,
  },
  ratingPillsStack: {
    width: "100%",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingPill: {
    alignItems: "center",
    marginBottom: 6,
  },
  ratingPillPartner: {
    marginTop: 2,
    marginBottom: 0,
  },
  ratingNum: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  ratingPillMuted: {
    minHeight: 32,
    justifyContent: "center",
    marginBottom: 4,
  },
  ratingPillMutedText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
  fleetStarRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  starSlot: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  aboutText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 16,
    marginBottom: 12,
  },
  xpCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  xpTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  xpEyebrow: { fontSize: 9, fontWeight: "900", color: "rgba(148,163,184,0.95)", letterSpacing: 2 },
  xpPct: { fontSize: 11, fontWeight: "900", color: "#5eead4" },
  xpTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.9)",
    overflow: "hidden",
  },
  xpFill: { height: "100%", borderRadius: 999 },
  xpFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  xpFooterTxt: { fontSize: 8, fontWeight: "700", color: "rgba(148,163,184,0.9)", letterSpacing: 0.6 },

  contentWrap: {
    marginTop: -18,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    gap: 14,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statTile: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statTileNum: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  statTileLbl: {
    fontSize: 7,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
  },
  interactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  interactiveRowLeft: { flex: 1, flexDirection: "row", gap: 12, minWidth: 0 },
  interactiveEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  interactiveTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  interactiveSub: {
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 16,
    marginTop: 4,
  },
  dashIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  premiumCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  premiumCardInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  premiumDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.cinematicDivider,
    marginLeft: 52,
  },

  profileItemRow: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  profileItemRowPressed: {
    opacity: 0.9,
  },
  profileItemRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  profileItemIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  profileItemIconBoxPressed: {
    backgroundColor: Theme.darkBackground,
  },
  profileItemTextWrap: { flex: 1, minWidth: 0 },
  profileItemLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2.2,
    color: Theme.textSecondary,
    marginBottom: 2,
  },
  profileItemValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  profileItemRightSpacer: { width: 14, height: 14 },

  signOutBtn: {
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.cinematicHeaderBg,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  signOutBtnPressed: {
    backgroundColor: Theme.teslaRed,
    transform: [{ scale: 0.985 }],
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 2.4,
  },
  signOutConfirmBackdrop: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: "center",
    backgroundColor: Theme.overlayBackdrop,
  },
  signOutConfirmCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  signOutConfirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  signOutConfirmBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 14,
  },
  signOutConfirmActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  signOutConfirmCancelBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 16,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.backgroundInput,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  signOutConfirmCancelBtnPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  signOutConfirmCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  signOutConfirmCtaBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.teslaRed,
  },
  signOutConfirmCtaBtnPressed: {
    opacity: 0.9,
  },
  signOutConfirmCtaBtnDisabled: {
    opacity: 0.7,
  },
  signOutConfirmCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
  },

  roadmapWrap: { paddingHorizontal: Layout.screenPaddingHorizontal, gap: 10 },
  roadmapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roadmapBack: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  roadmapTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 2,
  },
  roadmapHero: {
    borderRadius: 28,
    padding: 20,
    overflow: "hidden",
  },
  roadmapWatermark: {
    position: "absolute",
    right: 8,
    top: 8,
    opacity: 0.4,
  },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  crownBox: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  roadmapEyebrow: { fontSize: 8, fontWeight: "900", color: "rgba(148,163,184,0.95)", letterSpacing: 2 },
  roadmapTierName: { fontSize: 22, fontWeight: "900", color: "#fff", marginTop: 2 },
  roadmapProgBlock: { marginBottom: 16 },
  roadmapProgLabels: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  roadmapProgLeft: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  roadmapProgPct: { fontSize: 10, fontWeight: "900", color: AMBER_400 },
  roadmapTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  roadmapFill: { height: "100%", backgroundColor: AMBER_400, borderRadius: 999 },
  roadmapSmall: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 6 },
  roadmapSteps: { gap: 8 },
  roadmapStepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  roadmapDot: { width: 10, height: 10, borderRadius: 5 },
  roadmapStepText: { flex: 1 },
  roadmapStepTitle: { fontSize: 12, fontWeight: "800", color: "#e2e8f0" },
  roadmapStepSub: { fontSize: 9, color: "rgba(148,163,184,0.9)", marginTop: 2 },
});
