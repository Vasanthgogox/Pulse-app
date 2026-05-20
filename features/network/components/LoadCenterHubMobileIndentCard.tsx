/**
 * Mobile loads hub — ticket card aligned with TripsHubMobileTripCard.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import { formatMobileTripSchedule } from "@/features/trips/components/TripsHubMobileTripCard";
import { splitTripLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const REF = {
  card: Theme.screenBackground,
  ink: "#1c1c1e",
  inkMid: "#3d4650",
  muted: "#9aa3ad",
  hairline: "#e8ecf0",
  accent: "#1a73e8",
  radius: 16,
} as const;

const ROUTE_ARROW_TOP = 2;
const ROUTE_PIN_SIZE = 8;
const HEAD_AVATAR = 24;

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

function formatPartyName(value: string): string {
  return asLabel(value).toUpperCase();
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
}) {
  const { city, detail } = splitTripLocationDisplay(location);
  const end = align === "right";
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text style={[styles.legCity, end && styles.textEnd]} numberOfLines={1}>
            {asLabel(city)}
          </Text>
          {detail ? (
            <Text style={[styles.legDetail, end && styles.textEnd]} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
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
  avatarUrl?: string | null;
  avatarSeed?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function LoadCenterHubMobileListCanvas({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.list, style]}>{children}</View>;
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
  avatarUrl,
  avatarSeed,
  onPress,
  style,
}: LoadCenterHubMobileIndentCardProps) {
  const indentNo = asLabel(getIndentDisplayNumber(indent));
  const schedule = formatMobileTripSchedule(
    pickupIso ?? indent.pickup_date ?? indent.created_at,
  );
  const displayName = formatPartyName(titleName);
  const avatarFb =
    (avatarSeed ?? "").trim() ||
    (indent.client_id
      ? `client-entity:${String(indent.client_id).trim()}`
      : `indent:${indent.id}`);

  return (
    <View style={[styles.cardWrap, style]}>
      <View style={styles.card}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${indentNo} ${displayName}, ${asLabel(origin)} to ${asLabel(dest)}`}
        >
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <PartyAvatar
                name={displayName}
                initialsColorSeed={avatarFb}
                avatarUrl={avatarUrl}
                avatarSeed={avatarSeed}
                entityType="client"
                size={HEAD_AVATAR}
              />
              <View style={styles.headText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
            </View>
            <Text style={styles.headMeta} numberOfLines={1}>
              {asLabel(statusLabel).toUpperCase()}
            </Text>
          </View>

          <View style={styles.route}>
            <RouteLeg location={origin} variant="origin" align="left" />
            <View style={styles.routeMid}>
              <Text style={styles.routeArrow}>→</Text>
            </View>
            <RouteLeg location={dest} variant="dest" align="right" />
          </View>

          <View style={styles.divider} />

          <View style={styles.refRow}>
            <Text style={styles.refLine} numberOfLines={1}>
              <Text style={styles.refId}>{indentNo}</Text>
              <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
            </Text>
          </View>

          <View style={styles.partyRow}>
            <Text style={styles.footerLabel} numberOfLines={1}>
              {leftFooterLabel}
            </Text>
            <Text style={[styles.footerLabel, styles.footerLabelEnd]} numberOfLines={1}>
              {rightFooterLabel}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  cardWrap: {
    width: "100%",
    marginBottom: 12,
  },
  card: {
    backgroundColor: REF.card,
    borderRadius: REF.radius,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(15, 23, 42, 0.08)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  bodyPressed: {
    opacity: 0.98,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  brand: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.1,
    fontWeight: "400",
  },
  headMeta: {
    flexShrink: 0,
    maxWidth: "40%",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  leg: {
    flex: 1,
    minWidth: 0,
  },
  legEnd: {
    alignItems: "flex-end",
  },
  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: {
    justifyContent: "flex-end",
  },
  legText: {
    flex: 1,
    minWidth: 0,
  },
  legTextEnd: {
    alignItems: "flex-end",
  },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    marginTop: 2,
    flexShrink: 0,
  },
  routePinOrigin: {
    backgroundColor: REF.accent,
  },
  routePinDest: {
    backgroundColor: Theme.positive,
  },
  legCity: {
    fontSize: 11,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: -0.15,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  legDetail: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
  },
  textEnd: {
    textAlign: "right",
  },
  routeMid: {
    width: 24,
    paddingTop: ROUTE_ARROW_TOP,
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: REF.hairline,
    marginTop: 12,
    marginBottom: 10,
  },
  refRow: {
    minWidth: 0,
  },
  refLine: {
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 0.1,
  },
  refId: {
    fontSize: 8,
    fontWeight: "500",
    color: REF.inkMid,
    lineHeight: 11,
    fontVariant: ["tabular-nums"],
  },
  refMuted: {
    fontSize: 8,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 11,
    fontVariant: ["tabular-nums"],
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
    minHeight: 18,
  },
  footerLabel: {
    ...FinanceTxnTypography.partyTitle,
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: -0.15,
    fontWeight: "400",
    color: REF.inkMid,
    textTransform: "uppercase",
  },
  footerLabelEnd: {
    textAlign: "right",
  },
});
