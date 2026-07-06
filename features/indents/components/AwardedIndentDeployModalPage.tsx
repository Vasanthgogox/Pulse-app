import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Scale,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react-native";

import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { deployModalStyles as styles } from "@/features/indents/components/AwardedIndentDeployModal.styles";
import { useIndentClientEntityAvatar } from "@/features/indents/hooks/useIndentClientEntityAvatar";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import type { PendingAwardedDeployItem } from "@/features/indents/utils/pendingAwardedDeploy.util";
import {
  buildIndentDeployTiming,
  type IndentBidAlertTone,
} from "@/features/indents/utils/bidding/indentBidAlert.util";
import { formatINR, formatIndentTonsToCarry } from "@/lib/format";

const FINANCE_SCORECARD_GRADIENT = [
  Theme.financeCardSlateFrom,
  Theme.financeCardSlateTo,
] as const;

const VEHICLE_ACCENT = Theme.buttonMatteBlack;

const heroOnGradient = {
  eyebrow: Theme.textOnDarkMuted,
  subtitle: "rgba(255,255,255,0.78)",
} as const;

const NEXT_STEPS = [
  "Assign driver and vehicle to put this trip on your books",
  "Other invitations wait until you finish this deploy",
] as const;

function dueTextStyle(tone: IndentBidAlertTone) {
  switch (tone) {
    case "overdue":
      return styles.timingDueOverdue;
    case "urgent":
      return styles.timingDueUrgent;
    case "soon":
      return styles.timingDueSoon;
    default:
      return styles.timingDueNeutral;
  }
}

function dueIconColor(tone: IndentBidAlertTone): string {
  switch (tone) {
    case "overdue":
      return "#DC2626";
    case "urgent":
      return "#EA580C";
    case "soon":
      return "#D97706";
    default:
      return Theme.buttonMatteBlack;
  }
}

export type AwardedIndentDeployModalPageProps = {
  item: PendingAwardedDeployItem;
  pageNumber: number;
  pageTotal: number;
  enabled: boolean;
};

export const AwardedIndentDeployModalPage = memo(function AwardedIndentDeployModalPage({
  item,
  pageNumber,
  pageTotal,
  enabled,
}: AwardedIndentDeployModalPageProps) {
  const { currentOrganization } = useOrganization();
  const viewerOrgId = currentOrganization?.id ?? null;
  const { indent, quote, shipperName, awardAmountInr } = item;

  const { fields: clientAvatar } = useIndentClientEntityAvatar({
    clientId: indent.client_id,
    ownerOrgId: viewerOrgId,
    shipperOrgId: indent.organization_id,
    isOwner: false,
    enabled,
  });

  const indentNo = getIndentDisplayNumber(indent);
  const origin = indent.pickup_area || "—";
  const dest = indent.drop_location || "—";
  const vehicleType = indent.vehicle_type ? indent.vehicle_type.toUpperCase() : null;
  const tonsToCarry = formatIndentTonsToCarry(indent.weight);
  const hasTons = indent.weight != null && indent.weight > 0;
  // Tile: show tons as amount when available, else show vehicle type as amount
  const tonsTileAmount = hasTons ? tonsToCarry : (vehicleType ?? "—");
  // When no tons: don't repeat load_type in tile (already shown as chip in header)
  const tonsTileHint = hasTons ? (vehicleType ?? null) : null;
  const loadType = indent.load_type ? indent.load_type : null;

  // "2 details" → real inline detail chips
  const detailChips: string[] = [];
  if (loadType) detailChips.push(loadType);
  if (vehicleType && hasTons) detailChips.push(vehicleType);
  if (!hasTons && !loadType && vehicleType) detailChips.push(vehicleType);

  const pickupDateLabel = useMemo(() => {
    const raw = indent.pickup_date ?? indent.created_at;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, [indent.created_at, indent.pickup_date]);

  const pickupMeta = useMemo(() => {
    const raw = indent.pickup_date ?? indent.created_at;
    if (!raw) return indentNo;
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return indentNo;
      const time = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const date = d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      return `${indentNo} · ${time} · ${date}`;
    } catch {
      return indentNo;
    }
  }, [indent.created_at, indent.pickup_date, indentNo]);

  const timing = useMemo(
    () => buildIndentDeployTiming(quote, indent),
    [quote, indent],
  );

  const showTimingCard = Boolean(
    timing.dueByLabel || timing.awardedDurationLabel || timing.transitDurationLabel,
  );

  return (
    <View style={styles.pagerPage}>
      <LinearGradient
        colors={[...FINANCE_SCORECARD_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroEyebrowRow}>
            <Sparkles size={11} color={heroOnGradient.subtitle} strokeWidth={2.5} />
            <Text style={styles.heroEyebrow}>ACTION REQUIRED</Text>
          </View>
          {pageTotal > 1 ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueText}>
                {pageNumber}/{pageTotal}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroBody}>
          <View style={styles.heroLogoWrap}>
            <PartyAvatar
              name={shipperName}
              avatarUrl={clientAvatar.avatarUrl}
              avatarSeed={clientAvatar.avatarSeed}
              organizationImageUrl={clientAvatar.organizationImageUrl}
              organizationAvatarSeed={clientAvatar.organizationAvatarSeed}
              initialsColorSeed={indent.organization_id ?? shipperName}
              entityType="client"
              size={56}
              style={styles.heroAvatar}
              borderStyle={styles.heroAvatar}
            />
            <View style={styles.heroLogoBadge}>
              <Truck size={8} color="#fff" strokeWidth={2.5} />
            </View>
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              Trip awarded to you
            </Text>
            <Text style={styles.heroShipperName} numberOfLines={2}>
              {shipperName}
            </Text>
            <View style={styles.heroPillRow}>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>Vehicle deploy</Text>
              </View>
              {pickupDateLabel ? (
                <Text style={styles.heroDate}>Pickup {pickupDateLabel}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>YOUR OFFER</Text>
          <View style={styles.offerPillRow}>
            {detailChips.map((chip) => (
              <View key={chip} style={styles.offerPill}>
                <Text style={styles.offerPillText}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.payGrid}>
          <View style={[styles.payTile, styles.payTileAccent]}>
            <View style={[styles.payTileIconWrap, styles.payTileIconOnAccent]}>
              <Wallet size={15} color={VEHICLE_ACCENT} strokeWidth={2.2} />
            </View>
            <Text style={styles.payTileAmount}>{formatINR(awardAmountInr)}</Text>
            <Text style={styles.payTileLabel}>AGREED RATE</Text>
            <Text style={styles.payTileHint} numberOfLines={1}>
              {shipperName}
            </Text>
          </View>

          <View style={[styles.payTile, styles.payTileNeutral]}>
            <View style={styles.payTileIconWrap}>
              <Scale size={15} color={VEHICLE_ACCENT} strokeWidth={2.2} />
            </View>
            <Text style={styles.payTileAmount} numberOfLines={1}>
              {tonsTileAmount}
            </Text>
            <Text style={styles.payTileLabel}>{hasTons ? "TONS TO CARRY" : "VEHICLE TYPE"}</Text>
            {tonsTileHint ? (
              <Text style={styles.payTileHint} numberOfLines={1}>
                {tonsTileHint}
              </Text>
            ) : null}
          </View>
        </View>

        <LoadCardRouteRow
          origin={origin}
          destination={dest}
          compact
          style={styles.routeRow}
        />

        {showTimingCard ? (
          <View style={styles.timingCard}>
            {timing.combinedLabel ? (
              <View style={styles.timingLine}>
                {timing.tone === "overdue" ? (
                  <AlertTriangle
                    size={12}
                    color={dueIconColor(timing.tone)}
                    strokeWidth={2.2}
                  />
                ) : (
                  <Clock3
                    size={12}
                    color={dueIconColor(timing.tone)}
                    strokeWidth={2.2}
                  />
                )}
                <Text
                  style={[styles.timingText, dueTextStyle(timing.tone)]}
                  numberOfLines={2}
                >
                  {timing.combinedLabel}
                </Text>
              </View>
            ) : null}
            {timing.tone === "overdue" ? (
              <View style={styles.timingLine}>
                <AlertTriangle size={12} color="#DC2626" strokeWidth={2.2} />
                <Text style={[styles.timingText, styles.timingDueOverdue]} numberOfLines={2}>
                  Contact shipper to confirm — pickup window has passed
                </Text>
              </View>
            ) : null}
            {timing.transitDurationLabel ? (
              <View style={styles.timingLine}>
                <Truck size={12} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={[styles.timingText, styles.timingDuration]} numberOfLines={1}>
                  {timing.transitDurationLabel}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.metaText} numberOfLines={1}>
            {pickupMeta}
          </Text>
          <View style={styles.statusPill}>
            <Truck size={10} color={VEHICLE_ACCENT} strokeWidth={2.2} />
            <Text style={styles.statusPillText}>Vehicle required</Text>
          </View>
        </View>

        <View style={styles.nextCard}>
          <Text style={styles.nextTitle}>What happens next</Text>
          {NEXT_STEPS.map((step) => (
            <View key={step} style={styles.nextRow}>
              <ArrowRight size={12} color={VEHICLE_ACCENT} strokeWidth={2.4} />
              <Text style={styles.nextText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});
