/**
 * Unified shell footer + bottom nav (Q-unified-base aligned).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { Command } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const springBounce = { damping: 14, stiffness: 400 };
const springSettle = { damping: 18, stiffness: 320 };

/** Wraps content with a pop-in animation when selected. */
function AnimatedTabIcon({
  selected,
  children,
}: {
  selected: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withSpring(1.15, springBounce),
        withSpring(1.05, springSettle),
      );
    } else {
      scale.value = withSpring(1, springSettle);
    }
  }, [selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        animatedStyle,
        styles.animatedIconWrap,
        Platform.OS === "web" && styles.animatedIconWrapWeb,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function AnimatedPress({
  children,
  style,
  onPress,
  activeOpacity = 0.9,
}: {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
  activeOpacity?: number;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={style}
        onPress={onPress}
        activeOpacity={activeOpacity}
        onPressIn={() => {
          scale.value = withTiming(0.96, {
            duration: 120,
            easing: Easing.out(Easing.quad),
          });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, {
            duration: 140,
            easing: Easing.out(Easing.quad),
          });
        }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function AnimatedNavPill({
  active,
  onPress,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onPress?: () => void;
  icon: React.ComponentProps<typeof FontAwesome5>["name"];
  title: string;
  subtitle?: string;
}) {
  const hoverProgress = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  const springCfg = { damping: 24, stiffness: 200, mass: 1 };

  useEffect(() => {
    activeProgress.value = withSpring(active ? 1 : 0, springCfg);
    if (active) hoverProgress.value = withSpring(0, springCfg);
  }, [active, activeProgress]);

  // Single derived value — active always wins, hover fills in when idle.
  // Both useAnimatedStyle hooks read this; no duplicate Math.max on the UI thread.
  const expansionProgress = useDerivedValue(() =>
    Math.max(activeProgress.value, hoverProgress.value)
  );

  const pillStyle = useAnimatedStyle(() => {
    const p = expansionProgress.value;
    const bgAlpha = activeProgress.value > hoverProgress.value
      ? activeProgress.value          // active → full dark
      : hoverProgress.value * 0.05;   // hover only → very subtle tint
    const borderAlpha = activeProgress.value * 0.6 + hoverProgress.value * 0.08;
    return {
      width: interpolate(p, [0, 1], [44, 160]),
      backgroundColor: `rgba(15,23,42,${bgAlpha})`,
      borderColor: `rgba(15,23,42,${borderAlpha})`,
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const p = expansionProgress.value;
    return {
      opacity: p,
      transform: [{ translateX: interpolate(p, [0, 1], [-12, 0]) }],
    };
  });

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        if (!active) hoverProgress.value = withSpring(1, springCfg);
      }}
      onHoverOut={() => {
        if (!active) hoverProgress.value = withSpring(0, springCfg);
      }}
      style={styles.webNavPressable}
    >
      <Animated.View style={[styles.webNavPill, pillStyle]}>
        {/* Fixed-width icon box — never shifts during expansion */}
        <View style={styles.webNavIconBox}>
          <FontAwesome5
            name={icon}
            size={16}
            color={active ? Theme.textOnPrimary : Theme.textMutedDemo}
            solid={active}
          />
        </View>
        {/* Absolutely positioned text — revealed by the pill mask */}
        <Animated.View style={[styles.webNavTextAbs, textStyle]}>
          <Text numberOfLines={1} style={[styles.webNavTitle, active && styles.webNavTitleActive]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.webNavSub, active && styles.webNavSubActive]}>
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export type DemoTabId = "finance" | "trips" | "network" | "loadCenter" | "resources";

interface DemoTabBarProps {
  activeTab: DemoTabId;
  onTabChange: (tab: DemoTabId) => void;
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

export function DemoTabBar({
  activeTab,
  onTabChange,
  onProfilePress,
  onNotificationsPress,
}: DemoTabBarProps) {
  const { profile } = useAuth();
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted)
          setProfileAvatarUri(
            getUser2DAvatarUriForSeed(profile.avatar_seed.trim()),
          );
        return;
      }
      if (mounted)
        setProfileAvatarUri(
          getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED),
        );
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useLanguage();
  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && windowWidth >= 1024;
  const isFiscal = activeTab === "finance";
  const isTrips = activeTab === "trips";
  const isNetwork = activeTab === "network";
  const isLoadCenter = activeTab === "loadCenter";
  const displayName = (
    profile?.full_name ??
    profile?.displayName ??
    "User"
  ).trim();
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "US";

  const dockBottom = insets.bottom;
  const verticalPad = Math.max(dockBottom / 4, 4);
  const bottomPad = verticalPad + 6;

  if (isDesktopWeb) {
    const navItems: Array<{
      id: DemoTabId;
      title: string;
      subtitle?: string;
      icon: React.ComponentProps<typeof FontAwesome5>["name"];
      active: boolean;
    }> = [
      {
        id: "finance",
        title: "FINANCE",
        subtitle: "LEDGER",
        icon: "dollar-sign",
        active: isFiscal,
      },
      {
        id: "trips",
        title: "TRIPS",
        subtitle: "OPERATIONS",
        icon: "route",
        active: isTrips,
      },
      {
        id: "network",
        title: "NETWORK",
        subtitle: "MARKET",
        icon: "chart-line",
        active: isNetwork,
      },
      {
        id: "loadCenter",
        title: "LOAD",
        subtitle: "CENTER",
        icon: "truck-loading",
        active: isLoadCenter,
      },
    ];

    return (
      <View style={[styles.webTopShell, Platform.OS === "web" && ({ backdropFilter: "blur(24px)" } as any)]}>
        <View style={styles.webHeaderRow}>
          <View style={styles.webBrandWrap}>
            <View>
              <Text style={styles.webBrandTitle}>
                PULSE
                <Text style={styles.webBrandDotText}>.</Text>
              </Text>
            </View>
          </View>

          <View style={styles.webNavPillGroup}>
            {navItems.map((item) => (
              <AnimatedNavPill
                key={`${item.id}-${item.title}`}
                active={item.active}
                onPress={() => onTabChange(item.id)}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
              />
            ))}
          </View>

          <View style={styles.webUtilityWrap}>
            <AnimatedPress
              style={styles.webBellBtn}
              activeOpacity={0.8}
              onPress={onNotificationsPress}
            >
              <FontAwesome5 name="bell" size={16} color="#64748b" />
            </AnimatedPress>
            <AnimatedPress
              onPress={onProfilePress}
              style={styles.webAvatarBtn}
              activeOpacity={0.8}
            >
              {profileAvatarUri ? (
                <Image
                  source={{ uri: profileAvatarUri }}
                  style={styles.webProfileAvatar}
                />
              ) : (
                <Text style={styles.webAvatarText}>{initials}</Text>
              )}
            </AnimatedPress>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.footerWrap,
        { paddingTop: verticalPad, paddingBottom: bottomPad },
      ]}
    >
      <View style={styles.mobileFooterRow}>
        <TouchableOpacity
          style={styles.mobileEdgeBtn}
          activeOpacity={0.85}
          accessibilityLabel="Control hub"
          accessibilityRole="button"
        >
          <Command size={16} color="#ffffff" strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.glassDock}>
          <View style={styles.tabsRow}>
            {/* Column 1: Fiscal — pill behind when active */}
            <View style={styles.dockColumn}>
              <View
                style={[
                  styles.activePill,
                  isFiscal && styles.activePillVisible,
                ]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("finance")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isFiscal}>
                  <FontAwesome5
                    name="credit-card"
                    size={18}
                    color={isFiscal ? "#ffffff" : "#94a3b8"}
                    solid={isFiscal}
                  />
                  <Text style={[styles.dockLabel, isFiscal && styles.dockLabelActive]}>
                    {t("finance").toUpperCase()}
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>

            {/* Column 2: Trips — route icon (voyage/fleet) */}
            <View style={styles.dockColumn}>
              <View
                style={[styles.activePill, isTrips && styles.activePillVisible]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("trips")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isTrips}>
                  <FontAwesome5
                    name="route"
                    size={18}
                    color={isTrips ? "#ffffff" : "#94a3b8"}
                    solid={isTrips}
                  />
                  <Text style={[styles.dockLabel, isTrips && styles.dockLabelActive]}>
                    {t("trips").toUpperCase()}
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>

            {/* Column 3: Network */}
            <View style={styles.dockColumn}>
              <View
                style={[
                  styles.activePill,
                  isNetwork && styles.activePillVisible,
                ]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("network")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isNetwork}>
                  <FontAwesome5
                    name="users"
                    size={18}
                    color={isNetwork ? "#ffffff" : "#94a3b8"}
                    solid={isNetwork}
                  />
                  <Text style={[styles.dockLabel, isNetwork && styles.dockLabelActive]}>
                    {t("network").toUpperCase()}
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>

            {/* Column 4: Load Center */}
            <View style={styles.dockColumn}>
              <View
                style={[
                  styles.activePill,
                  isLoadCenter && styles.activePillVisible,
                ]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("loadCenter")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isLoadCenter}>
                  <FontAwesome5
                    name="truck-loading"
                    size={15}
                    color={
                      isLoadCenter ? Theme.textOnPrimary : Theme.textMutedDemo
                    }
                    solid={isLoadCenter}
                  />
                  <Text
                    style={[
                      styles.dockLabel,
                      styles.dockLabelCompact,
                      isLoadCenter && styles.dockLabelActive,
                    ]}
                  >
                    LOAD
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={onProfilePress}
          style={styles.mobileProfileBtn}
          activeOpacity={0.85}
          accessibilityLabel="Profile"
          accessibilityRole="button"
        >
          {profileAvatarUri ? (
            <Image
              source={{ uri: profileAvatarUri }}
              style={styles.mobileProfileAvatar}
            />
          ) : (
            <Text style={styles.mobileAvatarText}>{initials}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  animatedIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  animatedIconWrapWeb: {
    flexDirection: "column",
    gap: 3,
  },
  footerWrap: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "transparent",
    paddingHorizontal: 6,
  },
  mobileFooterRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  glassDock: {
    flex: 1,
    height: Layout.tabBarHeight + 6,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.05)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  mobileEdgeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  mobileProfileBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(203,213,225,0.5)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mobileProfileAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
  },
  mobileAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  glassDockWeb: {
    height: Layout.tabBarHeight + 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    backgroundColor: "#fff",
    elevation: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  webTopShell: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    zIndex: 200,
    elevation: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  webHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  webBrandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 230,
    paddingRight: 8,
  },
  webBrandLogo: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  webBrandTitle: {
    fontSize: 34,
    fontWeight: "900",
    color: "#0f172a",
    fontStyle: "italic",
    letterSpacing: -1,
    lineHeight: 36,
  },
  webBrandDotText: {
    color: Theme.darkGreen,
    fontSize: 38,
    lineHeight: 38,
  },
  webBrandSub: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: Theme.textMutedDemo,
  },
  webNavPillGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    borderRadius: 999,
    padding: 6,
    minWidth: 0,
    maxWidth: 520,
    width: "auto",
    overflow: "hidden",
  },
  webNavPressable: {
    flexShrink: 0,
  },
  webNavPill: {
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  webNavIconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  webNavTextAbs: {
    position: "absolute",
    left: 44,
    top: 0,
    bottom: 0,
    width: 110,
    justifyContent: "center",
  },
  webNavTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 1.8,
  },
  webNavTitleActive: {
    color: "#ffffff",
  },
  webNavSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  webNavSubActive: {
    color: Theme.teslaRed,
  },
  webUtilityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 90,
    justifyContent: "flex-end",
    paddingRight: 6,
  },
  webBellBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  webAvatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  webAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tabsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  tabsRowWeb: {
    flex: 1,
    minWidth: 420,
    justifyContent: "center",
    alignItems: "stretch",
    backgroundColor: "rgba(15,23,42,0.05)",
    borderRadius: 24,
    marginVertical: 6,
    padding: 2,
  },
  webRightWrap: {
    width: 200,
    height: "100%",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 24,
    flexShrink: 0,
  },
  webRightWrapCompact: {
    width: 80,
    paddingRight: 12,
  },
  webRightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  webProfileBtn: {
    padding: 4,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  webProfileAvatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  dockColumn: {
    flex: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  dockColumnWeb: {
    flex: 1,
  },
  activePill: {
    position: "absolute",
    top: 3,
    left: 2,
    right: 2,
    bottom: 3,
    borderRadius: 18,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    opacity: 0,
  },
  activePillVisible: {
    opacity: 1,
  },
  activePillWeb: {
    borderRadius: 16,
    backgroundColor: "#0f172a",
  },
  activePillAccent: {
    position: "absolute",
    bottom: -4,
    left: "30%",
    right: "30%",
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e11d48",
  },
  activePillAccentWeb: {
    bottom: 0,
    left: "28%",
    right: "28%",
    height: 3,
    borderRadius: 999,
  },
  dockButton: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: Layout.minTouchTargetSize,
  },
  dockLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: Theme.textMutedDemo,
  },
  dockLabelCompact: {
    letterSpacing: 0.55,
  },
  dockLabelActive: {
    color: "#ffffff",
  },
  dockLabelActiveWeb: {
    color: Theme.textPrimaryDark,
  },
  dockLabelWeb: {
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 0,
  },
  shellFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    paddingBottom: 8,
  },
  shellFooterBrand: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textMutedDemo,
  },
  shellFooterMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
});
