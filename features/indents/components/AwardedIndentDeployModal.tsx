import { memo, useMemo } from "react";
import {
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowRight,
  Check,
  Scale,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react-native";

import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useIndentClientEntityAvatar } from "@/features/indents/hooks/useIndentClientEntityAvatar";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import type { PendingAwardedDeployItem } from "@/features/indents/utils/pendingAwardedDeploy.util";
import { deployModalStyles as styles } from "@/features/indents/components/AwardedIndentDeployModal.styles";
import { formatINR, formatIndentTonsToCarry } from "@/lib/format";

export type AwardedIndentDeployModalProps = {
  visible: boolean;
  item: PendingAwardedDeployItem;
  queueIndex?: number;
  queueTotal?: number;
  onAssign: () => void;
  onLater: () => void;
  onViewLoad?: () => void;
};

/** Vehicle finance tab scorecard — same slate gradient as VehicleDetailScreen. */
const FINANCE_SCORECARD_GRADIENT = [
  Theme.financeCardSlateFrom,
  Theme.financeCardSlateTo,
] as const;

const VEHICLE_ACCENT = Theme.buttonMatteBlack;

/** Hero text on finance scorecard gradient (matches entity hero styles). */
const heroOnGradient = {
  eyebrow: Theme.textOnDarkMuted,
  subtitle: "rgba(255,255,255,0.78)",
} as const;
const NEXT_STEPS = [
  "Assign driver and vehicle to put this trip on your books",
  "Other invitations wait until you finish this deploy",
] as const;

export const AwardedIndentDeployModal = memo(function AwardedIndentDeployModal({
  visible,
  item,
  queueIndex = 1,
  queueTotal = 1,
  onAssign,
  onLater,
  onViewLoad,
}: AwardedIndentDeployModalProps) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const viewerOrgId = currentOrganization?.id ?? null;
  const { indent, shipperName, awardAmountInr } = item;

  const { fields: clientAvatar } = useIndentClientEntityAvatar({
    clientId: indent.client_id,
    ownerOrgId: viewerOrgId,
    shipperOrgId: indent.organization_id,
    isOwner: false,
    enabled: visible,
  });
  const indentNo = getIndentDisplayNumber(indent);
  const origin = indent.pickup_area || "—";
  const dest = indent.drop_location || "—";
  const vehicleType = (indent.vehicle_type || "—").toUpperCase();
  const tonsToCarry = formatIndentTonsToCarry(indent.weight);

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

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, Platform.OS === "web" ? styles.backdropWeb : null]}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 4 },
          ]}
        >
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
              {queueTotal > 1 ? (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueText}>
                    {queueIndex}/{queueTotal}
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
              <View style={styles.offerPill}>
                <Text style={styles.offerPillText}>2 details</Text>
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
                  {tonsToCarry}
                </Text>
                <Text style={styles.payTileLabel}>TONS TO CARRY</Text>
                <Text style={styles.payTileHint} numberOfLines={1}>
                  {vehicleType}
                </Text>
              </View>
            </View>

            <LoadCardRouteRow
              origin={origin}
              destination={dest}
              compact
              style={styles.routeRow}
            />

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

          <View style={styles.footer}>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.laterBtnOutline}
                onPress={onLater}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Later"
              >
                <Text style={styles.laterBtnOutlineText}>Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.assignBtn}
                onPress={onAssign}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Assign vehicle"
              >
                <LinearGradient
                  colors={[...FINANCE_SCORECARD_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.assignGradient}
                >
                  <Check size={14} color={Theme.textOnDark} strokeWidth={3} />
                  <Text style={styles.assignText}>Assign vehicle</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {onViewLoad ? (
              <TouchableOpacity
                onPress={onViewLoad}
                style={styles.viewLoadBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View load details"
              >
                <Text style={styles.viewLoadText}>View load</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
});
