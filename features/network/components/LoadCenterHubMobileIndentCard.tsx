/**
 * Load Center hub indent card — Ajio / opportunity-card layout.
 * Shared across My load, Get load, and Action required stages.
 */
import {
  HUB_GRID_CARD_MIN_HEIGHT,
} from "@/components/hub/hubGridCardLayout";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import type {
  GetLoadSourceTag,
  LoadCenterTicketCommerce,
} from "@/features/network/utils/loadCenter.model";
import {
  formatStoryDateTimeWithFallback,
  splitLocationParts,
} from "@/features/network/utils/storyDisplay";
import type { LoadCenterTripAllocation } from "@/features/network/utils/loadCenterTripAllocation.util";
import { formatINR } from "@/lib/format";
import { ArrowRight } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";

import {
  HubMobileListCanvas,
  hubMobileListCanvasStyles,
} from "@/components/hub";

const INK = "#111827";
const MUTED = "#6B7280";
const BODY = "#4B5563";
const LINK = "#2563EB";
const BORDER = "#E5E7EB";
const CARD_EDGE = "#D1D5DB";
const CANVAS_SOFT = "#F9FAFB";
const ALLOCATION_AVATAR_SIZE = 24;

/** @deprecated Use `HUB_GRID_CARD_MIN_HEIGHT` from `@/components/hub/hubGridCardLayout`. */
export const LOAD_CENTER_GRID_CARD_MIN_HEIGHT = HUB_GRID_CARD_MIN_HEIGHT;

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function formatWeightChip(weightKg: number | null | undefined): string | null {
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const tonnes = kg / 1000;
  if (tonnes >= 0.1) {
    const rounded = Math.round(tonnes * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} t`;
  }
  return `${Math.round(kg)} kg`;
}

function titleCaseWord(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type StatusChipTone =
  | "live"
  | "bidded"
  | "action"
  | "won"
  | "muted"
  | "warn";

/**
 * Find-loads OpportunityCard tone map.
 * Get Load (sourceTag set) = bidder view → BIDDED blue.
 * Give Load (owner) = BIDS / LIVE green while quotes are open.
 */
function resolveStatusChip(
  statusLabel: string,
  sourceTag?: GetLoadSourceTag | null,
): {
  text: string;
  tone: StatusChipTone;
} {
  const s = asLabel(statusLabel).trim().toLowerCase();
  const isGetLoad = sourceTag != null;
  if (s === "action required" || s === "allocate") {
    return { text: "ACTION", tone: "action" };
  }
  if (
    s === "bids won" ||
    s === "awarded" ||
    s === "claimed" ||
    s === "accepted"
  ) {
    return { text: "WON", tone: "won" };
  }
  if (
    s === "broadcast" ||
    s === "open" ||
    s === "open market" ||
    s === "live"
  ) {
    return { text: "LIVE", tone: "live" };
  }
  if (s === "receiving bids" || s === "quoted" || s === "my bids") {
    if (isGetLoad) return { text: "BIDDED", tone: "bidded" };
    return { text: "BIDS", tone: "live" };
  }
  if (s === "countered") return { text: "COUNTER", tone: "warn" };
  if (s === "declined" || s === "rejected") {
    return { text: "REJECTED", tone: "warn" };
  }
  if (s === "lost") {
    return { text: "LOST", tone: "warn" };
  }
  if (s === "cancelled") {
    return { text: "CANCELLED", tone: "muted" };
  }
  if (s === "expired") {
    return { text: "EXPIRED", tone: "muted" };
  }
  if (s === "converted") {
    return { text: "CONVERTED", tone: "won" };
  }
  if (s === "completed" || s === "done") {
    return { text: "DONE", tone: "muted" };
  }
  if (s === "draft") return { text: "DRAFT", tone: "muted" };
  const short = asLabel(statusLabel).toUpperCase();
  return {
    text: short.length > 10 ? short.slice(0, 9) : short,
    tone: "muted",
  };
}

/** Meta under party name — matches OpportunityCard “You already bid · date”. */
function resolveChannelLabel(
  sourceTag: GetLoadSourceTag | null | undefined,
  statusLabel: string,
): string {
  const s = asLabel(statusLabel).trim().toLowerCase();
  if (sourceTag != null) {
    if (s === "receiving bids" || s === "my bids" || s === "quoted") {
      return "You already bid";
    }
    if (s === "countered") return "Counter offer received";
    if (
      s === "bids won" ||
      s === "awarded" ||
      s === "action required" ||
      s === "allocate"
    ) {
      return "Your bid won";
    }
    if (s === "declined" || s === "rejected") return "Bid declined";
    if (s === "lost") return "Awarded to another bidder";
    if (s === "cancelled") return "Indent cancelled";
    if (s === "expired") return "Opportunity expired";
    if (s === "converted") return "Won · converted to trip";
    if (s === "completed" || s === "done") return "Converted to trip";
    return sourceTag === "network" ? "Network indent" : "Market indent";
  }
  if (s === "action required") return "Bids won · allocate";
  if (s === "bids won" || s === "awarded") return "Bids won";
  if (s === "draft") return "Draft load";
  return "My load";
}

function resolveInlineCta(
  statusLabel: string,
  sourceTag: GetLoadSourceTag | null | undefined,
): string | null {
  const s = asLabel(statusLabel).trim().toLowerCase();
  if (s === "action required" || s === "allocate") return "Allocate";
  if (s === "bids won" || s === "awarded") return "Allocate";
  if (
    s === "receiving bids" ||
    s === "countered" ||
    s === "my bids" ||
    s === "quoted"
  ) {
    return "Update bid";
  }
  if (sourceTag != null && (s === "open market" || s === "open" || s === "live")) {
    return "View & bid";
  }
  if (
    s === "lost" ||
    s === "cancelled" ||
    s === "expired" ||
    s === "declined" ||
    s === "rejected" ||
    s === "converted" ||
    s === "completed" ||
    s === "done"
  ) {
    return null;
  }
  if (sourceTag != null) return "View";
  return "View";
}

export type LoadCenterHubMobileIndentCardProps = {
  indent: IndentRow;
  titleName: string;
  statusLabel: string;
  origin: string;
  dest: string;
  pickupIso?: string | null;
  leftFooterLabel: string;
  rightFooterLabel: string;
  /** Ticket commerce: target rate / your quote / bids won. */
  ticketCommerce?: LoadCenterTicketCommerce | null;
  /** Network partner vs market discovery (Reach / ad). */
  sourceTag?: GetLoadSourceTag | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed?: string;
  /** Shown on Done → Converted to trips (driver + vehicle from linked trip). */
  tripAllocation?: LoadCenterTripAllocation | null;
  /** Opens indent detail. Omit on desktop kanban — CTAs handle navigation. */
  onPress?: () => void;
  /** Footer slot (share / pulse / CTA) — rendered outside the pressable body. */
  actions?: ReactNode;
  /** Tighter padding for 4-column desktop grid cards. */
  dense?: boolean;
  /** Stretch card to fill grid cell height. */
  fillGrid?: boolean;
  /** Soften LOST / CANCELLED / EXPIRED Done cards. */
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** @deprecated Use `HubMobileListCanvas` from `@/components/hub`. */
export function LoadCenterHubMobileListCanvas({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <HubMobileListCanvas style={style}>{children}</HubMobileListCanvas>;
}

export function LoadCenterHubMobileIndentCard({
  indent,
  titleName,
  statusLabel,
  origin,
  dest,
  pickupIso,
  leftFooterLabel,
  rightFooterLabel,
  ticketCommerce,
  sourceTag = null,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  initialsColorSeed,
  tripAllocation,
  onPress,
  actions,
  dense = false,
  fillGrid = false,
  dimmed = false,
  style,
}: LoadCenterHubMobileIndentCardProps) {
  const router = useRouter();
  const displayName = asLabel(titleName);
  const avatarFb =
    (initialsColorSeed ?? avatarSeed ?? "").trim() ||
    (indent.client_id
      ? `client-entity:${String(indent.client_id).trim()}`
      : `indent:${indent.id}`);

  const originParts = splitLocationParts(origin);
  const destParts = splitLocationParts(dest);
  const statusChip = resolveStatusChip(statusLabel, sourceTag);
  const channelLabel = resolveChannelLabel(sourceTag, statusLabel);
  const isGetLoadCard = sourceTag != null;
  /** Meta date: bid/posted date for Get Load; pickup for Give Load. */
  const clockIso = indent.shared_at ?? indent.created_at;
  const metaDateIso = isGetLoadCard
    ? indent.created_at ?? pickupIso ?? indent.pickup_date
    : pickupIso ?? indent.pickup_date ?? indent.created_at;
  const metaDateLabel = formatStoryDateTimeWithFallback(metaDateIso, clockIso);
  const loadDateIso = pickupIso ?? indent.pickup_date;
  const loadDateLabel = formatStoryDateTimeWithFallback(loadDateIso, clockIso);

  const vehicle =
    (indent.vehicle_type || leftFooterLabel || "").trim() || null;
  const material = (indent.load_type || "").trim() || null;
  const weight = formatWeightChip(
    typeof indent.weight === "number" ? indent.weight : Number(indent.weight),
  );
  /** Keep weight casing (“30 t”); title-case vehicle / material only. */
  const specChips = [
    vehicle ? titleCaseWord(vehicle) : null,
    weight,
    material ? titleCaseWord(material) : null,
  ].filter(Boolean) as string[];

  const commerce = ticketCommerce;
  const awardedVendorName = commerce?.awardedByName?.trim() || "";
  const awardedChannelLabel =
    !isGetLoadCard && awardedVendorName
      ? `Awarded to ${awardedVendorName}`
      : channelLabel;
  const metaLine = metaDateLabel
    ? `${awardedChannelLabel} · ${metaDateLabel}`
    : awardedChannelLabel;
  const heroAmount =
    commerce?.amountInr != null && commerce.amountInr > 0
      ? formatINR(commerce.amountInr)
      : null;
  const rawReferenceTarget =
    commerce?.targetRateInr != null && commerce.targetRateInr > 0
      ? stripCurrencyPrefix(formatINR(commerce.targetRateInr))
      : null;
  /** OpportunityCard pending-bid footer shows only YOUR BID + amount. */
  const referenceTarget =
    isGetLoadCard && (commerce?.kicker ?? "").toUpperCase() === "YOUR BID"
      ? null
      : rawReferenceTarget;
  const priceHint =
    commerce?.kicker?.trim() ||
    (heroAmount ? "Offer" : null);
  const priceMuted =
    commerce?.rightCaption?.trim() ||
    (!heroAmount ? rightFooterLabel : null);
  const fallbackCta =
    Boolean(onPress) && !actions
      ? resolveInlineCta(statusLabel, sourceTag)
      : null;

  const priceTrailing =
    actions != null ? (
      <View
        style={styles.priceActions}
        onStartShouldSetResponder={() => true}
      >
        {actions}
      </View>
    ) : fallbackCta ? (
      <Pressable style={styles.ctaHit} onPress={onPress} hitSlop={6}>
        <Text style={styles.ctaText}>{fallbackCta}</Text>
        <ArrowRight size={12} color={LINK} strokeWidth={2.4} />
      </Pressable>
    ) : null;

  return (
    <View
      style={[
        styles.cardWrap,
        fillGrid && styles.cardWrapGrid,
        dimmed && styles.cardWrapDimmed,
        style,
      ]}
    >
      <View style={[styles.card, fillGrid && styles.cardGrid]}>
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          style={({ pressed }) => [
            styles.body,
            dense && styles.bodyDense,
            fillGrid && styles.bodyGrid,
            Boolean(onPress) && pressed && styles.bodyPressed,
          ]}
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={
            onPress
              ? `${getIndentDisplayNumber(indent)} ${displayName}, ${asLabel(origin)} to ${asLabel(dest)}`
              : undefined
          }
        >
          <View style={styles.cardTop}>
            <PartyAvatar
              name={displayName}
              initialsColorSeed={avatarFb}
              organizationImageUrl={organizationImageUrl}
              organizationAvatarSeed={organizationAvatarSeed}
              avatarUrl={avatarUrl}
              avatarSeed={avatarSeed}
              entityType="client"
              size={32}
            />
            <View style={styles.cardTopText}>
              <Text style={styles.orgName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.metaLine} numberOfLines={2}>
                {metaLine}
              </Text>
            </View>
            <View
              style={[
                styles.statusChip,
                statusChip.tone === "live" && styles.statusChipLive,
                statusChip.tone === "bidded" && styles.statusChipBidded,
                statusChip.tone === "action" && styles.statusChipAction,
                statusChip.tone === "won" && styles.statusChipWon,
                statusChip.tone === "warn" && styles.statusChipWarn,
                statusChip.tone === "muted" && styles.statusChipMuted,
              ]}
              accessibilityLabel={asLabel(statusLabel)}
            >
              <Text
                style={[
                  styles.statusChipText,
                  statusChip.tone === "live" && styles.statusChipTextLive,
                  statusChip.tone === "bidded" && styles.statusChipTextBidded,
                  statusChip.tone === "action" && styles.statusChipTextAction,
                  statusChip.tone === "won" && styles.statusChipTextWon,
                  statusChip.tone === "warn" && styles.statusChipTextWarn,
                  statusChip.tone === "muted" && styles.statusChipTextMuted,
                ]}
                numberOfLines={1}
              >
                {statusChip.text}
              </Text>
            </View>
          </View>

          {/* Route: CSS grid on web (kanban stretch breaks RN flex row). */}
          <View style={styles.routeGrid}>
            <View style={styles.routeCol}>
              <Text style={styles.routeLabel}>PICKUP</Text>
              <Text style={styles.routeCity} numberOfLines={1}>
                {titleCaseWord(originParts.city)}
              </Text>
              {originParts.state ? (
                <Text style={styles.routeState} numberOfLines={1}>
                  {titleCaseWord(originParts.state)}
                </Text>
              ) : (
                <Text style={styles.routeStateSpacer}>{"\u00a0"}</Text>
              )}
            </View>
            <View style={styles.routeSep} pointerEvents="none" accessibilityElementsHidden>
              <View style={styles.routeSepLine} />
              <ArrowRight size={11} color={MUTED} strokeWidth={2.4} />
              <View style={styles.routeSepLine} />
            </View>
            <View style={[styles.routeCol, styles.routeColEnd]}>
              <Text style={[styles.routeLabel, styles.routeLabelEnd]}>DROP</Text>
              <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
                {titleCaseWord(destParts.city)}
              </Text>
              {destParts.state ? (
                <Text style={[styles.routeState, styles.routeStateEnd]} numberOfLines={1}>
                  {titleCaseWord(destParts.state)}
                </Text>
              ) : (
                <Text style={[styles.routeStateSpacer, styles.routeStateEnd]}>
                  {"\u00a0"}
                </Text>
              )}
            </View>
          </View>

          {specChips.length > 0 || loadDateLabel ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={styles.specScroll}
              contentContainerStyle={styles.specRow}
            >
              {specChips.map((chip) => (
                <View key={chip} style={styles.specChip}>
                  <Text style={styles.specChipText} numberOfLines={1}>
                    {chip}
                  </Text>
                </View>
              ))}
              {loadDateLabel ? (
                <View style={[styles.specChip, styles.specChipDate]}>
                  <Text style={styles.specChipDateText} numberOfLines={1}>
                    {loadDateLabel}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          {tripAllocation ? (
            <View style={styles.allocationRow}>
              <View style={styles.allocationCell}>
                <View style={styles.allocationPartyRow}>
                  {tripAllocation.driverId ? (
                    <Pressable
                      onPress={() =>
                        router.push(
                          `/public-profile/driver/${tripAllocation.driverId}`,
                        )
                      }
                      style={styles.allocationAvatarPress}
                      accessibilityRole="button"
                      accessibilityLabel={`View driver profile for ${tripAllocation.driver}`}
                      hitSlop={4}
                    >
                      <PartyAvatar
                        name={tripAllocation.driver}
                        avatarUrl={tripAllocation.driverAvatarUrl}
                        avatarSeed={tripAllocation.driverAvatarSeed}
                        entityType="driver"
                        size={ALLOCATION_AVATAR_SIZE}
                        initialsColorSeed={tripAllocation.driverId}
                      />
                    </Pressable>
                  ) : (
                    <PartyAvatar
                      name={tripAllocation.driver}
                      avatarUrl={tripAllocation.driverAvatarUrl}
                      avatarSeed={tripAllocation.driverAvatarSeed}
                      entityType="driver"
                      size={ALLOCATION_AVATAR_SIZE}
                      initialsColorSeed={tripAllocation.driver}
                    />
                  )}
                  <View style={styles.allocationTextCol}>
                    <Text style={styles.allocationLabel}>Driver</Text>
                    <Text style={styles.allocationValue} numberOfLines={1}>
                      {tripAllocation.driver}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.allocationDivider} />
              <View style={[styles.allocationCell, styles.allocationCellEnd]}>
                <Text style={[styles.allocationLabel, styles.allocationLabelEnd]}>
                  Vehicle
                </Text>
                <Text
                  style={[styles.allocationValue, styles.allocationValueEnd]}
                  numberOfLines={1}
                >
                  {tripAllocation.vehicle}
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>

        <View
          style={[
            styles.priceRow,
            dense && styles.priceRowDense,
            fillGrid && styles.priceRowGrid,
          ]}
        >
          <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={styles.priceCol}
          >
            {heroAmount ? (
              <>
                {priceHint ? (
                  <Text style={styles.priceHint} numberOfLines={1}>
                    {priceHint}
                  </Text>
                ) : null}
                <Text
                  style={[styles.price, (dense || fillGrid) && styles.priceDense]}
                  numberOfLines={1}
                >
                  {heroAmount}
                </Text>
                {referenceTarget ? (
                  <Text style={styles.priceRef} numberOfLines={1}>
                    {`${commerce?.referenceLabel?.trim() || "Client rate"} · ₹ ${referenceTarget}`}
                  </Text>
                ) : dense || fillGrid ? (
                  <Text style={styles.priceRefSpacer} accessible={false}>
                    {"\u00a0"}
                  </Text>
                ) : null}
                {awardedVendorName && !isGetLoadCard ? (
                  <Text style={styles.priceRef} numberOfLines={1}>
                    {`Vendor · ${awardedVendorName}`}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.priceMuted} numberOfLines={2}>
                {priceMuted || "Rate on request"}
              </Text>
            )}
          </Pressable>
          {priceTrailing}
        </View>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  web: {
    boxShadow:
      "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)",
  } as ViewStyle,
  default: {},
});

const styles = StyleSheet.create({
  cardWrap: {
    ...hubMobileListCanvasStyles.cardWrap,
  },
  cardWrapDimmed: {
    opacity: 0.72,
  },
  cardWrapGrid: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    marginBottom: 0,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_EDGE,
    overflow: "hidden",
    ...cardShadow,
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      } as ViewStyle,
      default: {},
    }),
  },
  cardGrid: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    minHeight: HUB_GRID_CARD_MIN_HEIGHT,
    flexDirection: "column",
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 14,
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      } as ViewStyle,
      default: {},
    }),
  },
  bodyDense: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  bodyGrid: {
    flex: 1,
    flexDirection: "column",
  },
  bodyPressed: {
    opacity: 0.94,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTopText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  orgName: {
    fontSize: 12,
    fontWeight: "500",
    color: INK,
    letterSpacing: -0.1,
    lineHeight: 15,
  },
  metaLine: {
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 13,
  },
  statusChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  statusChipLive: {
    backgroundColor: "#ECFDF5",
    borderColor: "rgba(21, 128, 61, 0.18)",
  },
  statusChipBidded: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37, 99, 235, 0.22)",
  },
  statusChipAction: {
    backgroundColor: Theme.accentBrownWash,
    borderColor: Theme.accentBrownBorder,
  },
  statusChipWon: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusChipWarn: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.2)",
  },
  statusChipMuted: {
    backgroundColor: CANVAS_SOFT,
    borderColor: BORDER,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusChipTextLive: {
    color: Theme.positive,
  },
  statusChipTextBidded: {
    color: LINK,
  },
  statusChipTextAction: {
    color: Theme.accentBrownDeep,
  },
  statusChipTextWon: {
    color: Theme.positive,
  },
  statusChipTextWarn: {
    color: Theme.warning,
  },
  statusChipTextMuted: {
    color: BODY,
  },
  routeGrid: Platform.select({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 28px minmax(0, 1fr)",
      columnGap: 6,
      alignItems: "start",
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
    } as any,
    default: {
      flexDirection: "row",
      alignItems: "flex-start",
      alignSelf: "stretch",
      width: "100%",
      gap: 6,
    },
  }),
  routeCol: Platform.select({
    web: {
      minWidth: 0,
      maxWidth: "100%",
      overflow: "hidden",
    } as ViewStyle,
    default: {
      flex: 1,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
    },
  }),
  routeColEnd: {
    alignItems: "flex-end",
  },
  routeSep: {
    paddingTop: 16,
    width: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    flexShrink: 0,
    flexGrow: 0,
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "row",
        alignSelf: "start",
        width: 28,
      } as any,
      default: {},
    }),
  },
  routeSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_EDGE,
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: MUTED,
    letterSpacing: 0.45,
    textTransform: "uppercase",
    marginBottom: 3,
    lineHeight: 12,
  },
  routeLabelEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeCity: {
    fontSize: 12,
    fontWeight: "600",
    color: INK,
    lineHeight: 15,
    letterSpacing: -0.1,
    textTransform: "uppercase",
    ...Platform.select({
      web: { maxWidth: "100%" } as any,
      default: {},
    }),
  },
  routeCityEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 12,
  },
  routeStateEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeStateSpacer: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: "transparent",
  },
  /** Single-row side-scroll — match OpportunityCard; web needs max-content so chips don't stretch. */
  specScroll: {
    width: "100%",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    marginTop: 2,
    ...Platform.select({
      web: {
        overflow: "hidden",
      } as ViewStyle,
      default: {},
    }),
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        alignItems: "center",
        width: "max-content",
        minWidth: "100%",
      } as any,
      default: {},
    }),
  },
  specChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: CANVAS_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    flexGrow: 0,
    flexShrink: 0,
    ...Platform.select({
      web: {
        display: "flex",
        flex: "none" as unknown as number,
        width: "max-content",
        boxSizing: "border-box",
      } as any,
      default: {},
    }),
  },
  specChipDate: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37, 99, 235, 0.28)",
  },
  specChipText: {
    fontSize: 10,
    fontWeight: "500",
    color: BODY,
    lineHeight: 14,
  },
  specChipDateText: {
    fontSize: 10,
    fontWeight: "600",
    color: LINK,
    lineHeight: 14,
  },
  allocationRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 10,
    backgroundColor: CANVAS_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: "hidden",
  },
  allocationCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  allocationPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  allocationAvatarPress: {
    borderRadius: ALLOCATION_AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  allocationTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  allocationCellEnd: {
    alignItems: "flex-end",
  },
  allocationDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  allocationLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: MUTED,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  allocationLabelEnd: {
    textAlign: "right",
  },
  allocationValue: {
    fontSize: 10,
    fontWeight: "500",
    color: INK,
    letterSpacing: -0.1,
    lineHeight: 13,
  },
  allocationValueEnd: {
    textAlign: "right",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: CANVAS_SOFT,
  },
  priceRowDense: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  priceRowGrid: {
    marginTop: "auto",
    alignItems: "center",
  } as ViewStyle,
  priceCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  priceActions: {
    flexShrink: 0,
    maxWidth: "52%",
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    alignSelf: "center",
  },
  priceHint: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: MUTED,
    lineHeight: 12,
    marginBottom: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    color: INK,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  priceDense: {
    fontSize: 15,
    lineHeight: 19,
  },
  priceRef: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "400",
    color: MUTED,
    fontVariant: ["tabular-nums"],
    lineHeight: 12,
  },
  /** Keeps grid footers level when some cards lack a target / client rate line. */
  priceRefSpacer: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    color: "transparent",
  },
  priceMuted: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
  },
  ctaHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingVertical: 2,
    paddingLeft: 2,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
    color: LINK,
  },
});
