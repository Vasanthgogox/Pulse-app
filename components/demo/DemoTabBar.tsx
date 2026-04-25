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
  interpolateColor,
  useAnimatedStyle,
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
  const expandProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
    expandProgress.value = withTiming(active ? 1 : 0, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, activeProgress]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const expanded = active ? 1 : expandProgress.value;
    const bg = interpolateColor(
      activeProgress.value,
      [0, 1],
      ["rgba(15,23,42,0)", "rgba(0,0,0,1)"],
    );
    const border = interpolateColor(
      activeProgress.value,
      [0, 1],
      ["rgba(15,23,42,0.04)", "rgba(255,255,255,0.12)"],
    );
    return {
      width: interpolate(expanded, [0, 1], [52, 184]),
      backgroundColor: bg,
      borderColor: border,
      transform: [
        { scale: 1 + hoverProgress.value * 0.02 + activeProgress.value * 0.01 },
        { translateY: -hoverProgress.value * 1.5 },
      ],
    };
  });

  const textAnimatedStyle = useAnimatedStyle(() => {
    const expanded = active ? 1 : expandProgress.value;
    return {
      opacity: expanded,
      width: interpolate(expanded, [0, 1], [0, 112]),
      transform: [{ translateX: interpolate(expanded, [0, 1], [-8, 0]) }],
    };
  });

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hoverProgress.value = withTiming(1, {
          duration: 140,
          easing: Easing.out(Easing.quad),
        });
        if (!active) {
          expandProgress.value = withTiming(1, {
            duration: 500,
            easing: Easing.out(Easing.cubic),
          });
        }
      }}
      onHoverOut={() => {
        hoverProgress.value = withTiming(0, {
          duration: 140,
          easing: Easing.out(Easing.quad),
        });
        if (!active) {
          expandProgress.value = withTiming(0, {
            duration: 500,
            easing: Easing.out(Easing.cubic),
          });
        }
      }}
      style={styles.webNavPressable}
    >
      <Animated.View style={[styles.webNavPill, pillAnimatedStyle]}>
        <FontAwesome5
          name={icon}
          size={12}
          color={active ? Theme.textOnPrimary : Theme.textMutedDemo}
          solid={active}
        />
        <Animated.View style={[styles.webNavTextWrap, textAnimatedStyle]}>
          <Text
            numberOfLines={1}
            style={[styles.webNavTitle, active && styles.webNavTitleActive]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[styles.webNavSub, active && styles.webNavSubActive]}
            >
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export type DemoTabId = "finance" | "trips" | "network" | "resources";

interface DemoTabBarProps {
  activeTab: DemoTabId;
  onTabChange: (tab: DemoTabId) => void;
  onProfilePress?: () => void;
}

export function DemoTabBar({
  activeTab,
  onTabChange,
  onProfilePress,
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
    ];

    return (
      <View style={styles.webTopShell}>
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
            <AnimatedPress style={styles.webBellBtn} activeOpacity={0.8}>
              <FontAwesome5 name="bell" size={13} color={Theme.textMutedDemo} />
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
          <Command size={16} color={Theme.textOnPrimary} strokeWidth={2.25} />
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
                    size={16}
                    color={isFiscal ? Theme.textOnPrimary : Theme.textMutedDemo}
                    solid={isFiscal}
                  />
                  <Text
                    style={[
                      styles.dockLabel,
                      isFiscal && styles.dockLabelActive,
                    ]}
                  >
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
                    size={16}
                    color={isTrips ? Theme.textOnPrimary : Theme.textMutedDemo}
                    solid={isTrips}
                  />
                  <Text
                    style={[
                      styles.dockLabel,
                      isTrips && styles.dockLabelActive,
                    ]}
                  >
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
                    size={16}
                    color={
                      isNetwork ? Theme.textOnPrimary : Theme.textMutedDemo
                    }
                    solid={isNetwork}
                  />
                  <Text
                    style={[
                      styles.dockLabel,
                      isNetwork && styles.dockLabelActive,
                    ]}
                  >
                    {t("network").toUpperCase()}
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
    paddingHorizontal: 8,
  },
  mobileFooterRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glassDock: {
    flex: 1,
    height: Layout.tabBarHeight + 4,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
    overflow: "hidden",
  },
  mobileEdgeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  mobileProfileBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mobileProfileAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  mobileAvatarText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
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
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.08)",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    zIndex: 200,
    elevation: 20,
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
    minWidth: 210,
    paddingRight: 8,
  },
  webBrandLogo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  webBrandTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  webBrandDotText: {
    color: Theme.darkGreen,
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
    gap: 12,
    backgroundColor: "rgba(15,23,42,0.04)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    borderRadius: 26,
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
    minWidth: 56,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.04)",
    overflow: "hidden",
  },
  webNavPillActive: {
    backgroundColor: Theme.darkBackground,
  },
  webNavTextWrap: {
    alignItems: "flex-start",
    minWidth: 0,
    maxWidth: 112,
    overflow: "hidden",
  },
  webNavTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.9,
  },
  webNavTitleActive: {
    color: Theme.textOnPrimary,
  },
  webNavSub: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.35,
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
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  webAvatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  webAvatarText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnPrimary,
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
    top: 2.5,
    left: 2.5,
    right: 2.5,
    bottom: 2.5,
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
    borderRadius: 18,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  activePillAccent: {
    position: "absolute",
    bottom: 0,
    left: "28%",
    right: "28%",
    height: 3,
    borderRadius: 999,
    backgroundColor: Theme.teslaRed,
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
    fontSize: 7,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Theme.textMutedDemo,
  },
  dockLabelActive: {
    color: Theme.textOnPrimary,
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
