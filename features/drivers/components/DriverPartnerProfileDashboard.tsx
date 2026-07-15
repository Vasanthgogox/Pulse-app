/**
 * Partner-profile dashboard layout for fleet drivers — matches CounterpartyProfileSystemCard chrome.
 */
import Theme from "@/constants/Theme";
import type { RatingRow } from "@/features/ratings";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { formatRelative } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { partnerProfileDashboardStyles as styles } from "./partnerProfileDashboard.styles";

function driverCompletionPercent(
  driver: DriverRow,
  ratings: RatingRow[],
): number {
  let score = 0;
  const total = 5;
  if ((driver.name ?? "").trim()) score += 1;
  if ((driver.phone ?? "").trim()) score += 1;
  if ((driver.email ?? "").trim()) score += 1;
  if (driver.user_id) score += 1;
  if (ratings.length > 0) score += 1;
  return Math.max(12, Math.min(100, Math.round((score / total) * 100)));
}

function formatRatingDate(iso: string): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

function Badge({
  children,
  variant = "gray",
}: {
  children: React.ReactNode;
  variant?: "green" | "blue" | "orange" | "gray";
}) {
  const palette = {
    green: {
      bg: Theme.positiveMuted,
      border: Theme.positive + "44",
      text: Theme.positive,
    },
    blue: {
      bg: Theme.fiscalTabActiveBg,
      border: Theme.aggregatePillBorder,
      text: Theme.aggregatePillText,
    },
    orange: {
      bg: Theme.warningMuted,
      border: Theme.warning + "55",
      text: Theme.warning,
    },
    gray: {
      bg: Theme.surfaceGray,
      border: Theme.borderMedium,
      text: Theme.textMuted,
    },
  }[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.badgeText, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

export type DriverPartnerProfileDashboardProps = {
  onClose: () => void;
  onEditPress?: () => void;
  /** Header CTA label; default "Edit Profile". Use "View identity" when connected. */
  editProfileLabel?: string;
  /** When true, hide the edit / view identity CTA (e.g. left stints). */
  hideEditProfile?: boolean;
  driver: DriverRow;
  profileAvatarUri: string | null;
  /** Formatted total earnings / contract exposure for the KPI strip */
  businessVolumeLabel: string;
  driverRatingAvg: number | null;
  tripsOperatedCount: number;
  settlementHealthPct: number;
  driverRatings: RatingRow[];
  tripRouteLabelByTripId: Map<string, string>;
  /** Latest vehicle number from trips, if any */
  assignedVehicleLabel?: string | null;
  driverOffer?: {
    payableAmount: number | null;
    commissionPercent: number | null;
    commissionPerKm: number | null;
  } | null;
  showCompensationBlock: boolean;
  leftAtFormatted: string | null;
  children?: ReactNode;
};

export function DriverPartnerProfileDashboard({
  onClose,
  onEditPress,
  editProfileLabel = "Edit Profile",
  hideEditProfile = false,
  driver,
  profileAvatarUri,
  businessVolumeLabel,
  driverRatingAvg,
  tripsOperatedCount,
  settlementHealthPct,
  driverRatings,
  tripRouteLabelByTripId,
  assignedVehicleLabel,
  driverOffer,
  showCompensationBlock,
  leftAtFormatted,
  children,
}: DriverPartnerProfileDashboardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 900;

  const completion = useMemo(
    () => driverCompletionPercent(driver, driverRatings),
    [driver, driverRatings],
  );

  const initials = useMemo(() => {
    const src = (driver.name ?? "").trim() || "DR";
    return src
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");
  }, [driver.name]);

  const shortId = (driver.id ?? "").trim().slice(0, 8) || "";

  const isIntegrated = Boolean(driver.user_id);

  const handleEdit = () => {
    if (onEditPress) {
      onEditPress();
      return;
    }
    Alert.alert(
      "Edit profile",
      "Update driver records from your fleet directory or driver onboarding flows.",
    );
  };

  const globalAvgDisplay =
    driverRatingAvg != null && driverRatingAvg > 0
      ? `${driverRatingAvg.toFixed(1)} ★`
      : "—";
  const trustDisplay =
    settlementHealthPct > 0 ? `${settlementHealthPct}%` : "—";

  const joinedLabel = driver.created_at
    ? formatRelative(driver.created_at)
    : "—";

  return (
    <View style={[styles.viewRoot, { paddingBottom: insets.bottom }]}>
      <View style={styles.viewStickyHeader}>
        <View style={styles.viewStickyLeft}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.iconBtn}
            hitSlop={12}
            accessibilityLabel="Close profile"
          >
            <FontAwesome name="chevron-left" size={22} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <Text style={styles.viewStickyTitle} numberOfLines={1}>
            Driver Profile
          </Text>
        </View>
        <View style={styles.viewStickyRight}>
          <Badge variant="gray">Driver</Badge>
          {!hideEditProfile ? (
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={handleEdit}
              activeOpacity={0.9}
            >
              <FontAwesome name="pencil" size={14} color={Theme.textOnPrimary} />
              <Text style={styles.editProfileBtnText}>{editProfileLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.viewScroll}
        contentContainerStyle={styles.viewScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identityCard}>
          <View style={styles.identityBlob} />
          <View style={styles.avatarRing}>
            <View style={styles.avatarCircle}>
              {profileAvatarUri ? (
                <Image
                  source={{ uri: profileAvatarUri }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
            </View>
          </View>
          <Text style={styles.identityName} numberOfLines={3}>
            {(driver.name ?? "Driver").trim() || "Driver"}
          </Text>
          {shortId ? (
            <Text style={styles.identityId}>#{shortId}</Text>
          ) : null}
          <View style={styles.identityBadgeRow}>
            {leftAtFormatted != null ? (
              <View style={[styles.pillIndigo, styles.pillIndigoMuted]}>
                <Text style={[styles.pillIndigoText, styles.pillIndigoTextMuted]}>
                  Disconnected
                </Text>
              </View>
            ) : (
              <View style={styles.pillEmerald}>
                <Text style={styles.pillEmeraldText}>Active Profile</Text>
              </View>
            )}
            <View
              style={[styles.pillIndigo, !isIntegrated && styles.pillIndigoMuted]}
            >
              <Text
                style={[
                  styles.pillIndigoText,
                  !isIntegrated && styles.pillIndigoTextMuted,
                ]}
              >
                {isIntegrated ? "Integrated Node" : "Core Node"}
              </Text>
            </View>
          </View>

          <View style={styles.completionBlock}>
            <View style={styles.completionHead}>
              <Text style={styles.completionLabel}>Profile Readiness</Text>
              <Text style={styles.completionPct}>{completion}%</Text>
            </View>
            <View style={styles.completionTrack}>
              <LinearGradient
                colors={[Theme.primaryLight, Theme.positive]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.completionFill, { width: `${completion}%` }]}
              />
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Business Volume</Text>
              <Text style={styles.kpiTileValue}>{businessVolumeLabel}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Network Trust</Text>
              <Text style={[styles.kpiTileValue, { color: Theme.positive }]}>
                {trustDisplay}
              </Text>
            </View>
          </View>

          <View style={[styles.kpiGrid, { marginTop: 12 }]}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Global Avg Rating</Text>
              <Text style={styles.kpiTileValue}>{globalAvgDisplay}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Trips Operated</Text>
              <Text style={styles.kpiTileValue}>{tripsOperatedCount}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.twoCol, !isWide && styles.twoColStack]}>
          <View style={styles.colBlock}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentIndigo} />
              <Text style={styles.sectionHeading}>Contact Registry</Text>
              {!isIntegrated && onEditPress ? (
                <TouchableOpacity
                  onPress={onEditPress}
                  hitSlop={12}
                  style={{ marginLeft: "auto" }}
                  accessibilityLabel="Edit contact"
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: Theme.primary }}>
                    Edit
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.registryCard}>
              {[
                {
                  label: "Driver Name",
                  value: (driver.name ?? "").trim() || "—",
                  icon: "user" as const,
                },
                {
                  label: "Email Link",
                  value: (driver.email ?? "").trim() || "—",
                  icon: "envelope" as const,
                },
                {
                  label: "Phone Registry",
                  value: (driver.phone ?? "").trim() || "—",
                  icon: "phone" as const,
                },
              ].map((item) => (
                <View key={item.label} style={styles.registryRow}>
                  <View style={styles.registryIconWrap}>
                    <FontAwesome name={item.icon} size={22} color={Theme.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.registryLabel}>{item.label}</Text>
                    <Text style={styles.registryValue} numberOfLines={3}>
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.colBlock}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentEmerald} />
              <Text style={styles.sectionHeading}>Fleet Identity</Text>
            </View>
            <View style={styles.registryCard}>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.taxLabel}>Vehicle Node</Text>
                <Text style={styles.taxGst}>
                  {(assignedVehicleLabel ?? "").trim() || "Not configured"}
                </Text>
              </View>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.taxLabel}>Node Status</Text>
                <Text style={styles.taxPan}>
                  {leftAtFormatted != null
                    ? `Disconnected · ${leftAtFormatted}`
                    : driver.status === "on_trip"
                      ? "On trip"
                      : driver.status === "online"
                        ? "Online"
                        : "Offline"}
                </Text>
              </View>
              <View>
                <Text style={styles.taxLabel}>Joined Pulse</Text>
                <Text style={styles.taxBilling}>{joinedLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        {showCompensationBlock ? (
          <>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentIndigo} />
              <Text style={styles.sectionHeading}>Compensation Terms</Text>
            </View>
            <View style={styles.compThreeCol}>
              <View style={styles.compCell}>
                <Text style={styles.compCellLabel}>Base Salary (Payable)</Text>
                <Text style={styles.compCellValue} numberOfLines={3}>
                  {driverOffer?.payableAmount != null &&
                  Number(driverOffer.payableAmount) > 0
                    ? `₹${Number(driverOffer.payableAmount).toLocaleString("en-IN")} / mo`
                    : "—"}
                </Text>
              </View>
              <View style={styles.compCell}>
                <Text style={styles.compCellLabel}>Trip Commission</Text>
                <Text style={styles.compCellValue} numberOfLines={2}>
                  {driverOffer?.commissionPercent != null &&
                  Number(driverOffer.commissionPercent) > 0
                    ? `${driverOffer.commissionPercent}%`
                    : "—"}
                </Text>
              </View>
              <View style={styles.compCell}>
                <Text style={styles.compCellLabel}>Per-KM Rate</Text>
                <Text style={styles.compCellValue} numberOfLines={2}>
                  {driverOffer?.commissionPerKm != null &&
                  Number(driverOffer.commissionPerKm) > 0
                    ? `₹${driverOffer.commissionPerKm} / km`
                    : "—"}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.blockSpaced}>
          <View style={styles.blockHeadingRow}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentAmber} />
              <Text style={styles.sectionHeading}>Operations Hub</Text>
            </View>
            <Text style={styles.linkCta}>Recent Feedback</Text>
          </View>
          {driverRatings.length === 0 ? (
            <Text style={styles.emptyMuted}>No ratings yet.</Text>
          ) : (
            <View style={[styles.hubGrid, !isWide && styles.hubGridStack]}>
              {driverRatings.map((r) => {
                const routeLabel =
                  tripRouteLabelByTripId.get(String(r.trip_id)) ??
                  "Route unavailable";
                return (
                  <View key={r.id} style={styles.hubCard}>
                    <View style={styles.hubIcon}>
                      <FontAwesome name="star" size={22} color={Theme.driverGold} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.ratingScoreRow}>
                        <Text style={styles.ratingScoreMain}>
                          {r.score.toFixed(1)}
                        </Text>
                        <Text style={styles.ratingScoreMax}>/ 5.0</Text>
                      </View>
                      <Text style={styles.ratingDate}>
                        {r.created_at ? formatRatingDate(r.created_at) : ""}
                      </Text>
                      <Text style={styles.hubAddr} numberOfLines={2}>
                        {routeLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {children}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}
