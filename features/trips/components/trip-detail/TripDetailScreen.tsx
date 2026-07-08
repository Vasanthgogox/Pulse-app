/**
 * Trip detail — manifest layout (hero, Journey / Finance / Vault).
 * Mobile native + narrow web; wide web uses the same screen with isDesktop layout.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { PersistentTabPanel } from "@/components/PersistentTabPanel";
import { EntityAvatar as PartyAvatar } from '@/components/EntityAvatar';
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { Theme } from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TripChatRoomSheet } from "@/features/chat/components/TripChatRoomSheet";
import {
  pushTripLedgerQuickEntry,
} from "@/features/finance/ledger/tripLedgerEntryChooser";
import { TripPayableReceivableSummaryCard } from "@/features/trips/components/trip-detail/adjustment/TripPayableReceivableSummaryCard";
import { TripMarginHero } from "@/features/trips/components/trip-detail/TripMarginHero";
import { TripLedgerTransactionPreviewModal } from "@/features/trips/components/trip-detail/TripLedgerTransactionPreviewModal";
import { TripAuditLogPanel } from "@/features/trips/components/trip-detail/TripAuditLogPanel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { latestTripSettlementLedgerEntry } from "@/features/trips/utils/tripSettlementLedgerEntries.util";
import { computePartnerIndentFreightCost } from "@/features/finance/utils/partnerIndentFreightCost.util";
import { resolveTripLedgerTripType } from "@/features/finance/utils/tripLedgerPayoutMode.util";
import { TripRatingsBlock } from "@/features/ratings/components/TripRatingsBlock";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import { ROUTES, tripExpenseEntryEditRoute } from "@/lib/routes";
import { formatINR, formatIndianVehicleNumber } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { getOptimalRoute } from "@/lib/routingService";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Activity, Check, MessageSquare, Zap } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import LottieView from "lottie-react-native";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
    type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    COST_REASON_OPTIONS,
    REVENUE_REASON_OPTIONS,
    adjustedCost,
    adjustedRevenue,
    isAdjustmentVoided,
    type TripAdjustment,
    type TripAdjustmentImpact,
    type TripAdjustmentType,
} from "../../services/tripAdjustments";
import { regenerateTripOtp } from "../../services/tripOtp.service";
import {
    getTripDisplayNumber,
    isTripCompleted,
    updateTripStatus,
    type TripRow,
} from "../../services/trips.service";
import { AggregateTripOtpPanel } from "../AggregateTripOtpPanel";
import { TripAssignmentBlock } from "../TripAssignmentBlock";
import { ReassignSheet } from "../reassign/ReassignSheet";
import { WaitingForDriverLocationOverlay } from "../reassign/WaitingForDriverLocationOverlay";
import { useReassignMigrationGate } from "@/features/trips/hooks/useReassignMigrationGate";
// ── Lazy-loaded modals: only imported when first rendered (not on page load) ──
const ProvisionAdjustmentModal = lazy(() =>
  import("@/features/trips/components/trip-detail/adjustment/ProvisionAdjustmentModal").then(
    (m) => ({ default: m.ProvisionAdjustmentModal }),
  ),
);
const ProvisionDeductionConfirmModal = lazy(() =>
  import("@/features/trips/components/trip-detail/adjustment/ProvisionDeductionConfirmModal").then(
    (m) => ({ default: m.ProvisionDeductionConfirmModal }),
  ),
);
const ProvisionNotePdfModal = lazy(() =>
  import("@/features/trips/components/trip-detail/adjustment/ProvisionNotePdfModal").then(
    (m) => ({ default: m.ProvisionNotePdfModal }),
  ),
);
import { TripFinanceAdjustmentsPanel } from "@/features/trips/components/trip-detail/adjustment/TripFinanceAdjustmentsPanel";
import type { ProvisionNotePdfContext } from "@/features/trips/components/trip-detail/adjustment/tripProvisionNotePdf.util";
import {
  buildCostDeductionSaveParams,
  type ClientPassThroughRecommendation,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";
import { TripOdometerPreviewCard } from "@/features/trips/components/trip-detail/TripOdometerPreviewCard";
const TripAdjustmentModal = lazy(() =>
  import("./TripAdjustmentModal").then((m) => ({ default: m.TripAdjustmentModal })),
);
// TripDetailFinanceView is currently unused (inside dead {false && ...} block) — not imported.
import type { TripDetailScreenProps } from "./TripDetailScreen.types";
import { TripMap } from "./TripMap";
import { ManifestDriverPingList } from "./ManifestDriverPingList";
import { useTripDetail } from "./hooks/useTripDetail";
import { useTrackingState } from "@/features/tracking/hooks/useTrackingState";
const LiveTrackingModal = lazy(() =>
  import("./modals/LiveTrackingModal").then((m) => ({ default: m.LiveTrackingModal })),
);
import {
  defaultTrackingState,
  isTripTrackingActive,
} from "@/features/trips/utils/tripTrackingStatus.util";
import {
  mergeMapLocationTrail,
  resolveMapTruckLocation,
} from "@/features/trips/utils/mapDriverTracking.util";
import { buildManifestDeliveryPlan } from "@/features/trips/utils/manifestDeliveryPlan.util";
import { buildDriverLastPingDisplay } from "@/features/trips/utils/driverLastPingDisplay.util";
import { TripDetailTrackingHub } from "./TripDetailTrackingHub";
import { ManifestRefAssetCard } from "./ManifestRefAssetCard";
import { useManifestRefAssetInsights } from "./hooks/useManifestRefAssetInsights";
import { parseTripCoordinate } from "@/features/driver/tripHistory/tripHistoryDetail.util";
import { DriverTrackingOfflineOverlay } from "./DriverTrackingOfflineOverlay";
import {
  MAP_LOCATION_LABEL_LOADING,
  resolveMapLocationLabel,
} from "@/lib/mapLocationLabel.service";
import {
  buildManifestJourneyLogs,
  getManifestCurrentStepIndex,
  getVisibleManifestJourneyLogs,
  manifestSimLogsForStepIndex,
  manifestStepIndexForLog,
  type ManifestJourneyLogEntry,
} from "@/features/trips/utils/manifestJourneyLog.util";
import { MANIFEST_PULSE_PING_DISPLAY_MAX } from "@/lib/trackingLocation.constants";
import { useTripVerificationSync } from "@/features/trips/verification";
import { useTripOperationsSummary, useTripOperationsSync } from "@/features/trips/operations";
const TripExpensesScreen = lazy(() =>
  import("@/features/trips/operations/hub/TripExpensesScreen").then(
    (m) => ({ default: m.TripExpensesScreen }),
  ),
);
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import {
  shouldShowManifestHeroDriverParty,
  type AggregateTripKindPillContext,
} from "@/features/drivers/utils/driverUtils.util";
import {
  buildAssetProvisionCostBreakdownLines,
  driverOfferFromDriverRow,
  selectAssetTripProvisionCostBreakdown,
  selectTripManifestMargin,
} from "@/features/finance";
import { computeTripSettlementDues, tripPayableCostTarget } from "@/features/finance/utils/tripSettlement.util";
import { getDriverById } from "@/features/drivers/services/drivers.service";
import { type ExpenseRow } from "./sections/ExpensesTable";
const LRDocumentsSection = lazy(() =>
  import("./sections/LRDocumentsSection").then((m) => ({ default: m.LRDocumentsSection })),
);
import {
    TripStatusTimeline,
    type TripStageTimestamp,
} from "./sections/TripStatusTimeline";

type Tab = "trip" | "finance" | "expenses" | "tracking" | "docs";

type TripWebExtra = {
  pickup_state?: string | null;
  drop_state?: string | null;
  driver_name?: string | null;
  vehicle_number?: string | null;
  supplier_name?: string | null;
  duration_minutes?: number | null;
  vehicle_type?: string | null;
  truck_type?: string | null;
  capacity?: string | null;
  vehicle_capacity?: string | null;
};

type LedgerWebExtra = LedgerRow & {
  reference_no?: string | null;
};

function formatLedgerDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

function ledgerHistoryTitle(tx: LedgerRow, isIn: boolean) {
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (isIn && tx.contact_type === "client") return "Customer payment";
  if (!isIn && tx.contact_type === "supplier") return "Supplier payment";
  if (!isIn && tx.contact_type === "driver") return "Driver payment";
  return isIn ? "Cash in" : "Cash out";
}

/** Revenue additions + supplier credits (cost −) improve simplified net. */
function adjustmentsCountingAsIncome(adjustments: TripAdjustment[]) {
  return adjustments.filter(
    (a) =>
      !isAdjustmentVoided(a) &&
      ((a.type === "revenue" && a.impact === "plus") ||
        (a.type === "cost" && a.impact === "minus")),
  );
}

/** Revenue deductions + supplier add-ons (cost +) reduce simplified net. */
function adjustmentsCountingAsDeductions(adjustments: TripAdjustment[]) {
  return adjustments.filter(
    (a) =>
      !isAdjustmentVoided(a) &&
      ((a.type === "revenue" && a.impact === "minus") ||
        (a.type === "cost" && a.impact === "plus")),
  );
}

const FINANCE_PROTOCOL_CHIPS = [
  "Loading",
  "Unloading",
  "Detention",
  "Damage",
  "Toll",
  "RTO",
] as const;

/** Labels for embedded provision rows (aligned with adjustment registry copy). */
function provisionLineMetaLabel(adj: TripAdjustment): string {
  if (adj.type === "revenue") {
    return adj.impact === "plus" ? "SALE · ADD-ON" : "SALE · DEDUCTION";
  }
  return adj.impact === "plus" ? "COST · ADD-ON" : "COST · DEDUCTION";
}

function protocolSupplierChipAdjustment(
  chip: (typeof FINANCE_PROTOCOL_CHIPS)[number],
): {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  reasonSeed: string;
} {
  if (chip === "Loading")
    return { type: "cost", impact: "plus", reasonSeed: "Loading Charges" };
  if (chip === "Unloading")
    return { type: "cost", impact: "plus", reasonSeed: "Unloading Charges" };
  if (chip === "Detention")
    return { type: "cost", impact: "plus", reasonSeed: "Detention" };
  if (chip === "Damage")
    return { type: "cost", impact: "plus", reasonSeed: "Damages / Missing" };
  if (chip === "Toll")
    return { type: "cost", impact: "plus", reasonSeed: "Pass Debit" };
  return { type: "cost", impact: "plus", reasonSeed: "Other" };
}

function getInlineReasonOptions(
  type: TripAdjustmentType,
  impact: TripAdjustmentImpact,
): readonly string[] {
  if (type === "revenue" && impact === "plus") {
    return ["Loading Charges", "Unloading Charges", "Other"];
  }
  if (type === "revenue" && impact === "minus") {
    return ["Late Delivery", "Damages / Missing", "Other"];
  }
  if (type === "cost" && impact === "plus") {
    return COST_REASON_OPTIONS;
  }
  return ["Damages / Missing", "Other"];
}

function splitLocationPrimarySecondary(location: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const raw = (location ?? "").trim();
  if (!raw) return { primary: "—", secondary: null };
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) return { primary: raw, secondary: null };
  const primary = raw.slice(0, commaIndex).trim() || raw;
  const secondary = raw.slice(commaIndex + 1).trim() || null;
  return { primary, secondary };
}

/** Straight-line km between coordinates; ~×1.3 used as rough road distance when DB/map omit km. */
function haversineKmBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number | null {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  if (
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(b.longitude)
  )
    return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number.isFinite(km) && km > 0 ? km : null;
}

const DISTANCE_CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  hyderabad: [17.385, 78.4867],
  ahmedabad: [23.0225, 72.5714],
  pune: [18.5204, 73.8567],
  shimla: [31.1048, 77.1734],
};

function inferCoordsFromLocationName(
  location: string | null | undefined,
): { latitude: number; longitude: number } | null {
  const raw = (location ?? "").trim().toLowerCase();
  if (!raw) return null;
  const firstPart = raw.split(",")[0]?.trim() ?? raw;
  const direct = DISTANCE_CITY_COORDS[firstPart];
  if (direct) return { latitude: direct[0], longitude: direct[1] };
  for (const [city, coords] of Object.entries(DISTANCE_CITY_COORDS)) {
    if (firstPart.includes(city) || raw.includes(city)) {
      return { latitude: coords[0], longitude: coords[1] };
    }
  }
  return null;
}

/** Manifest hero bridge — party avatars (client / driver / supplier). */
const MANIFEST_HERO_AVATAR_MOBILE = 34;
const MANIFEST_HERO_AVATAR_DESKTOP = 36;

const manifestHeroBridgePartyStyles = StyleSheet.create({
  avatarStack: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    borderWidth: 1.5,
    borderColor: "#0f172a",
    borderRadius: 999,
    backgroundColor: "#1e293b",
    overflow: "hidden",
  },
});

/** Right bridge party — text beside avatar (same structure as client column). */
function ManifestHeroBridgePartyEnd({
  roleLabel,
  partyName,
  entityType,
  avatarSize,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  isIntegrated,
  vehicleLabel,
  vehicleId,
}: {
  roleLabel: string;
  partyName: string;
  entityType: "driver" | "supplier";
  avatarSize: number;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
  vehicleLabel?: string | null;
  vehicleId?: string | null;
}) {
  const showVehicleBadge =
    entityType === "driver" &&
    !!String(vehicleLabel ?? "").trim();
  const badgeSize = Math.max(10, Math.round(avatarSize * 0.42));
  const stackSize = avatarSize + (showVehicleBadge ? 6 : 0);
  const iconWrapSize = stackSize;

  return (
    <View style={[styles.refHeroBridgeCol, styles.refHeroBridgeColRight]}>
      <View style={styles.refHeroBridgeTextColEnd}>
        <Text
          style={[styles.refHeroBridgeLabel, styles.refHeroBridgeLabelRight]}
          numberOfLines={1}
        >
          {roleLabel}
        </Text>
        <Text
          style={[styles.refHeroBridgeValue, styles.refHeroBridgeValueRight]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {partyName.toUpperCase()}
        </Text>
      </View>
      <View
        style={[
          styles.refHeroBridgeIconWrap,
          { width: iconWrapSize, height: iconWrapSize },
        ]}
      >
        <View
          style={[
            manifestHeroBridgePartyStyles.avatarStack,
            { width: stackSize, height: stackSize },
          ]}
        >
          <PartyAvatar
            name={partyName}
            entityType={entityType}
            size={avatarSize}
            avatarUrl={avatarUrl ?? undefined}
            avatarSeed={avatarSeed ?? undefined}
            organizationImageUrl={organizationImageUrl ?? undefined}
            organizationAvatarSeed={organizationAvatarSeed ?? undefined}
            isIntegrated={isIntegrated}
            showIntegrationBadge={false}
          />
          {showVehicleBadge ? (
            <View
              style={manifestHeroBridgePartyStyles.vehicleBadge}
              accessibilityLabel={`Vehicle ${vehicleLabel}`}
            >
              <PartyAvatar
                name={vehicleLabel!}
                entityType="driver"
                size={badgeSize}
                avatarSeed={vehicleId ?? undefined}
                showIntegrationBadge={false}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Desktop neo hero — same party row layout as mobile bridge. */
function NeoManifestHeroBridgePartyEnd({
  roleLabel,
  partyName,
  entityType,
  avatarSize,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  isIntegrated,
  vehicleLabel,
  vehicleId,
  styles: neo,
  partyStyles,
}: {
  roleLabel: string;
  partyName: string;
  entityType: "driver" | "supplier";
  avatarSize: number;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
  vehicleLabel?: string | null;
  vehicleId?: string | null;
  styles: {
    heroParty: object;
    heroPartyRight: object;
    heroPartyTextRight: object;
    heroKicker: object;
    alignRight: object;
    heroPartyName: object;
    heroVehicleBadge: object;
  };
  partyStyles: typeof manifestHeroBridgePartyStyles;
}) {
  const showVehicleBadge =
    entityType === "driver" && !!String(vehicleLabel ?? "").trim();
  const badgeSize = Math.max(10, Math.round(avatarSize * 0.42));
  const stackSize = avatarSize + (showVehicleBadge ? 6 : 0);

  return (
    <View style={[neo.heroParty, neo.heroPartyRight]}>
      <View style={neo.heroPartyTextRight}>
        <Text style={[neo.heroKicker, neo.alignRight]} numberOfLines={1}>
          {roleLabel}
        </Text>
        <Text
          style={[neo.heroPartyName, neo.alignRight]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {partyName.toUpperCase()}
        </Text>
      </View>
      <View
        style={[
          partyStyles.avatarStack,
          { width: stackSize, height: stackSize },
        ]}
      >
        <PartyAvatar
          name={partyName}
          entityType={entityType}
          size={avatarSize}
          avatarUrl={avatarUrl ?? undefined}
          avatarSeed={avatarSeed ?? undefined}
          organizationImageUrl={organizationImageUrl ?? undefined}
          organizationAvatarSeed={organizationAvatarSeed ?? undefined}
          isIntegrated={isIntegrated}
          showIntegrationBadge={false}
        />
        {showVehicleBadge ? (
          <View
            style={partyStyles.vehicleBadge}
            accessibilityLabel={`Vehicle ${vehicleLabel}`}
          >
            <PartyAvatar
              name={vehicleLabel!}
              entityType="driver"
              size={badgeSize}
              avatarSeed={vehicleId ?? undefined}
              showIntegrationBadge={false}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function TripDetailScreen({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  initialTab,
  initialFinanceSubTab,
  onBack,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "trip");
  useTripVerificationSync();
  useTripOperationsSync();
  const tripOperationsSummaryQuery = useTripOperationsSummary(tripId || null, {
    enabled: !!tripId,
  });
  const [financeSubTab, setFinanceSubTab] = useState<
    "summary" | "transactions"
  >(initialFinanceSubTab ?? "summary");
  const [previewLedgerTx, setPreviewLedgerTx] = useState<LedgerRow | null>(
    null,
  );
  const expenseTabAutoSelectedRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [locationLogExpanded, setLocationLogExpanded] = useState(false);
  const [showFinanceProvisionPanel, setShowFinanceProvisionPanel] = useState<
    "client" | "supplier" | null
  >(null);
  const [pendingCostDeduction, setPendingCostDeduction] =
    useState<ClientPassThroughRecommendation | null>(null);
  const [costDeductionSubmitting, setCostDeductionSubmitting] = useState(false);
  const [provisionNotePdfContext, setProvisionNotePdfContext] =
    useState<ProvisionNotePdfContext | null>(null);
  const [provisionEditTarget, setProvisionEditTarget] =
    useState<TripAdjustment | null>(null);
  const [provisionConfirm, setProvisionConfirm] = useState<{
    mode: "delete" | "edit";
    adjustment: TripAdjustment;
  } | null>(null);
  const [editingProvisionAdjustmentId, setEditingProvisionAdjustmentId] =
    useState<string | null>(null);
  const [showInlineAdjustmentForm, setShowInlineAdjustmentForm] =
    useState(false);
  const [inlineAdjType, setInlineAdjType] =
    useState<TripAdjustmentType>("revenue");
  const [inlineAdjImpact, setInlineAdjImpact] =
    useState<TripAdjustmentImpact>("plus");
  const [inlineAdjAmount, setInlineAdjAmount] = useState("");
  const [inlineAdjReason, setInlineAdjReason] = useState("");
  const [inlineAdjOtherReason, setInlineAdjOtherReason] = useState("");
  const [showReassignSheet, setShowReassignSheet] = useState(false);
  const [showTripAuditLog, setShowTripAuditLog] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [provisionVoidReason, setProvisionVoidReason] = useState("");

  const vehicleGalleryScrollRef = useRef<ScrollView | null>(null);
  const [vehicleGalleryPageWidth, setVehicleGalleryPageWidth] = useState(0);
  const vehicleGalleryInitialSyncedRef = useRef(false);

  const closeFinanceProvisionModal = () => {
    setShowFinanceProvisionPanel(null);
    setShowInlineAdjustmentForm(false);
    setProvisionConfirm(null);
    setProvisionVoidReason("");
    setEditingProvisionAdjustmentId(null);
    setProvisionEditTarget(null);
  };

  const openProvisionEdit = useCallback((adj: TripAdjustment) => {
    if (isAdjustmentVoided(adj)) return;
    setProvisionEditTarget(adj);
    setShowFinanceProvisionPanel(adj.type === "revenue" ? "client" : "supplier");
  }, []);

  const handleRequestCostDeduction = useCallback(
    (rec: ClientPassThroughRecommendation) => {
      setPendingCostDeduction(rec);
      setShowFinanceProvisionPanel(null);
    },
    [],
  );

  const isMobile = screenWidth < 640;
  const isTablet = screenWidth >= 640 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;
  const useCompactAdjustmentWizard = screenWidth < 680;
  const desktopTab: "tracking" | "finance" =
    activeTab === "finance" ? "finance" : "tracking";
  const hPad = isMobile ? 12 : isTablet ? 16 : 24;
  const mapHeight = isMobile ? 220 : isTablet ? 380 : 600;

  const detail = useTripDetail({
    tripId,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    onBack,
  });

  const manifestRefAssetInsights = useManifestRefAssetInsights({
    orgId:
      currentOrganization?.id ?? detail.trip?.organization_id ?? null,
    driverId: detail.trip?.driver_id ?? null,
    vehicleId: detail.trip?.vehicle_id ?? null,
  });
  const manifestDriverInsights =
    manifestRefAssetInsights.data?.driver ?? {
      ratingAvg: null,
      docsIssue: false,
    };
  const manifestVehicleInsights =
    manifestRefAssetInsights.data?.vehicle ?? {
      ratingAvg: null,
      docsIssue: false,
    };

  const handleConfirmCostDeduction = useCallback(async () => {
    if (!pendingCostDeduction || costDeductionSubmitting) return;
    setCostDeductionSubmitting(true);
    try {
      await detail.handleSaveAdjustment(buildCostDeductionSaveParams(pendingCostDeduction));
      setPendingCostDeduction(null);
    } finally {
      setCostDeductionSubmitting(false);
    }
  }, [pendingCostDeduction, costDeductionSubmitting, detail.handleSaveAdjustment]);

  const expensePendingCount =
    (tripOperationsSummaryQuery.data?.financialSnapshot?.approvalPendingCount ?? 0) +
    (tripOperationsSummaryQuery.data?.financialSnapshot?.settlementPendingCount ?? 0);

  const tripForAssetFinance = detail.trip;
  const assignedDriverCompQuery = useQuery({
    queryKey: [
      "q",
      "trip",
      tripId,
      "driver-comp",
      tripForAssetFinance?.driver_id ?? "",
    ],
    enabled:
      !!tripForAssetFinance?.driver_id &&
      !!tripForAssetFinance.organization_id &&
      !!tripForAssetFinance &&
      isAssetExecutionTrip(tripForAssetFinance),
    queryFn: async () => {
      const res = await getDriverById(
        tripForAssetFinance!.organization_id,
        tripForAssetFinance!.driver_id!,
      );
      if (res.error) throw res.error;
      return res.driver;
    },
    staleTime: 60_000,
  });

  const assetProvisionCostPreview = useMemo(() => {
    if (!tripForAssetFinance || !isAssetExecutionTrip(tripForAssetFinance)) {
      return null;
    }
    return selectAssetTripProvisionCostBreakdown({
      trip: tripForAssetFinance,
      events: tripOperationsSummaryQuery.data?.costEvents ?? [],
      driverOffer: driverOfferFromDriverRow(assignedDriverCompQuery.data ?? null),
    });
  }, [
    tripForAssetFinance,
    tripOperationsSummaryQuery.data?.costEvents,
    assignedDriverCompQuery.data,
  ]);

  useEffect(() => {
    if (!detail.trip || isAggregateTrip(detail.trip)) return;
    if (expenseTabAutoSelectedRef.current) return;
    if (activeTab !== "trip") return;
    if (expensePendingCount > 0) {
      setActiveTab("expenses");
      expenseTabAutoSelectedRef.current = true;
      return;
    }
    if (tripOperationsSummaryQuery.isFetched) {
      expenseTabAutoSelectedRef.current = true;
    }
  }, [
    activeTab,
    expensePendingCount,
    tripOperationsSummaryQuery.isFetched,
    detail.trip,
  ]);

  useEffect(() => {
    if (!detail.trip || !isAggregateTrip(detail.trip)) return;
    if (activeTab === "expenses") {
      setActiveTab("trip");
    }
  }, [detail.trip, activeTab]);

  const trackingState = useTrackingState(
    detail.trip?.id ?? null,
    detail.trip?.status ?? null,
    {
      isPinging: detail.isPingingDriver,
      lastPingRespondedAt: detail.lastPingRespondedAt,
      lastSeenAt: detail.lastSeenAt,
    },
  );
  const isPingTimedOut = detail.isPingTimedOut ?? false;
  const journeyTrackingActive = useMemo(
    () =>
      detail.trip
        ? isTripTrackingActive(detail.trip.status, detail.trip.completed_at)
        : false,
    [detail.trip?.status, detail.trip?.completed_at, detail.trip],
  );
  const showDriverTrackingOfflineOverlay = useMemo(
    () => journeyTrackingActive && (detail.isDriverOffline ?? false),
    [journeyTrackingActive, detail.isDriverOffline],
  );

  // Must run before any early return (loading/error) — Rules of Hooks.
  // One cached/deduped migration RPC per aggregate assignable trip (not per render).
  const tripForReassignGate = detail.trip;
  const reassignMigrationCheckEnabled =
    !!tripForReassignGate &&
    isAggregateTrip(tripForReassignGate) &&
    detail.canAssign &&
    !isTripCompleted(tripForReassignGate);
  const { migrationBlocked: reassignMigrationBlocked } =
    useReassignMigrationGate(reassignMigrationCheckEnabled);

  const goToVehicleGalleryIndex = useCallback(
    (nextIndex: number, animated = true) => {
      const total = detail.vehiclePreviewDocs.length;
      if (total <= 0) return;
      const clamped = Math.max(0, Math.min(nextIndex, total - 1));
      if (clamped !== detail.vehiclePreviewIndex) {
        detail.setVehiclePreviewIndex(clamped);
      }
      if (vehicleGalleryPageWidth > 0) {
        vehicleGalleryScrollRef.current?.scrollTo({
          x: clamped * vehicleGalleryPageWidth,
          animated,
        });
      }
    },
    [detail, vehicleGalleryPageWidth],
  );

  // One-shot scroll sync when the gallery first becomes visible, so the
  // hook's auto-jump to the first uploaded doc lines up with the carousel.
  // After that, scroll position and `vehiclePreviewIndex` stay in sync via
  // `onScroll` for swipes and `goToVehicleGalleryIndex` for taps.
  useEffect(() => {
    if (!detail.isVehicleGalleryDoc) {
      vehicleGalleryInitialSyncedRef.current = false;
      return;
    }
    if (vehicleGalleryPageWidth <= 0) return;
    if (vehicleGalleryInitialSyncedRef.current) return;
    vehicleGalleryInitialSyncedRef.current = true;
    vehicleGalleryScrollRef.current?.scrollTo({
      x: detail.vehiclePreviewIndex * vehicleGalleryPageWidth,
      animated: false,
    });
  }, [
    detail.isVehicleGalleryDoc,
    detail.vehiclePreviewIndex,
    vehicleGalleryPageWidth,
  ]);

  const [tripRoomOpen, setTripRoomOpen] = useState(false);

  const openOdometerVerification = useCallback(
    (side: "start" | "end") => {
      const id = detail.trip?.id;
      if (!id) return;
      router.push(ROUTES.tripVerification(id, side) as never);
    },
    [detail.trip?.id, router],
  );

  const handleOpenTripChat = useCallback(() => {
    if (!detail.trip?.id) return;
    setTripRoomOpen(true);
  }, [detail.trip?.id]);

  const [mapRouteDistanceKm, setMapRouteDistanceKm] = useState<string | null>(
    null,
  );
  const [manifestRouteEtaSeconds, setManifestRouteEtaSeconds] = useState<
    number | null
  >(null);
  const [simConfirmStep, setSimConfirmStep] = useState<{
    label: string;
    targetStatus: string;
    started_at?: string;
    completed_at?: string;
    driverLat: number | null;
    driverLng: number | null;
    driverLocLabel: string | null;
  } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [revokingSimulation, setRevokingSimulation] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    setMapRouteDistanceKm(null);
    setManifestRouteEtaSeconds(null);
  }, [tripId]);

  // Proactively fetch road distance as soon as coordinates are available.
  // This updates mapRouteDistanceKm before TripMap finishes its own async routing.
  useEffect(() => {
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    if (!o || !d) return;
    let cancelled = false;
    getOptimalRoute(o, d)
      .then((result) => {
        if (!cancelled && result) {
          setMapRouteDistanceKm((result.distance / 1000).toFixed(1));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    detail.trackingMapOriginCoordinate?.latitude,
    detail.trackingMapOriginCoordinate?.longitude,
    detail.trackingMapDestinationCoordinate?.latitude,
    detail.trackingMapDestinationCoordinate?.longitude,
  ]);

  const resolvedDistanceLabel = useMemo(() => {
    const tr = detail.trip;
    if (!tr) return null;
    const raw = tr.distance;
    if (raw != null && raw !== "") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(n) && n >= 0) {
        const s =
          Math.abs(n - Math.round(n)) < 1e-9
            ? String(Math.round(n))
            : n.toFixed(1);
        return `${s} km`;
      }
    }
    const mapKm = mapRouteDistanceKm?.trim();
    if (mapKm) return `${mapKm} km`;
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    const crow = o && d ? haversineKmBetween(o, d) : null;
    if (crow != null) return `≈ ${(crow * 1.3).toFixed(1)} km`;
    const inferredOrigin = inferCoordsFromLocationName(tr.pickup_area);
    const inferredDestination = inferCoordsFromLocationName(tr.drop_location);
    const inferredKm =
      inferredOrigin && inferredDestination
        ? haversineKmBetween(inferredOrigin, inferredDestination)
        : null;
    if (inferredKm != null) return `≈ ${(inferredKm * 1.3).toFixed(1)} km`;
    return null;
  }, [
    detail.trip,
    detail.trackingMapOriginCoordinate,
    detail.trackingMapDestinationCoordinate,
    mapRouteDistanceKm,
  ]);

  const timelineDistanceKm =
    resolvedDistanceLabel
      ?.replace(/^≈\s*/, "")
      .replace(/\s*km$/i, "")
      .trim() || undefined;

  // Parse simulation log entries stored in trip.notes.
  // Format: [BISIM|status|timestamp|lat|lng|userName]
  const simLogEntries = useMemo(() => {
    const notes = detail.trip?.notes;
    if (!notes) return [];
    return notes
      .split("\n")
      .filter((line) => line.startsWith("[BISIM|"))
      .map((line) => {
        const inner = line.slice(7, -1);
        const [status, timestamp, lat, lng, userName, fromStatus] =
          inner.split("|");
        return {
          status,
          timestamp,
          lat: parseFloat(lat) || null,
          lng: parseFloat(lng) || null,
          userName: userName || "Business",
          fromStatus: fromStatus || null,
        };
      });
  }, [detail.trip?.notes]);

  const [simLocationByKey, setSimLocationByKey] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const pending = simLogEntries.filter(
      (e) => e.lat != null && e.lng != null,
    );
    if (pending.length === 0) return;
    void (async () => {
      const next: Record<string, string> = {};
      for (const sim of pending) {
        const key = `${sim.status}|${sim.timestamp}`;
        const label = await resolveMapLocationLabel(sim.lat!, sim.lng!, {
          mode: "full",
        });
        if (label?.trim()) next[key] = label.trim();
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setSimLocationByKey((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [simLogEntries]);

  const hasAssignedDriverForEta = useMemo(
    () =>
      !!(
        detail.effectiveDriverIdForLocation?.trim() ||
        detail.trip?.driver_id?.trim()
      ),
    [detail.effectiveDriverIdForLocation, detail.trip?.driver_id],
  );

  const manifestRouteFetchEndpoints = useMemo(() => {
    const tr = detail.trip;
    if (!tr || !hasAssignedDriverForEta) return null;
    const dest =
      detail.trackingMapDestinationCoordinate ??
      (parseTripCoordinate(tr.drop_lat) != null &&
      parseTripCoordinate(tr.drop_lon) != null
        ? {
            latitude: parseTripCoordinate(tr.drop_lat)!,
            longitude: parseTripCoordinate(tr.drop_lon)!,
          }
        : null);
    if (!dest) return null;

    const driverPos =
      trackingState?.currentPosition ??
      (detail.driverLocation?.latitude != null &&
      detail.driverLocation?.longitude != null
        ? {
            latitude: detail.driverLocation.latitude,
            longitude: detail.driverLocation.longitude,
          }
        : null);
    if (driverPos) {
      return { from: driverPos, to: dest };
    }

    const origin =
      detail.trackingMapOriginCoordinate ??
      (parseTripCoordinate(tr.pickup_lat) != null &&
      parseTripCoordinate(tr.pickup_lon) != null
        ? {
            latitude: parseTripCoordinate(tr.pickup_lat)!,
            longitude: parseTripCoordinate(tr.pickup_lon)!,
          }
        : null);
    if (!origin) return null;
    return { from: origin, to: dest };
  }, [
    detail.trip,
    hasAssignedDriverForEta,
    detail.trackingMapOriginCoordinate,
    detail.trackingMapDestinationCoordinate,
    trackingState?.currentPosition,
    detail.driverLocation?.latitude,
    detail.driverLocation?.longitude,
  ]);

  useEffect(() => {
    if (!manifestRouteFetchEndpoints) {
      setManifestRouteEtaSeconds(null);
      return;
    }
    let cancelled = false;
    void getOptimalRoute(
      manifestRouteFetchEndpoints.from,
      manifestRouteFetchEndpoints.to,
    )
      .then((result) => {
        if (!cancelled && result?.duration != null) {
          setManifestRouteEtaSeconds(result.duration);
        }
      })
      .catch(() => {
        if (!cancelled) setManifestRouteEtaSeconds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    manifestRouteFetchEndpoints?.from.latitude,
    manifestRouteFetchEndpoints?.from.longitude,
    manifestRouteFetchEndpoints?.to.latitude,
    manifestRouteFetchEndpoints?.to.longitude,
  ]);

  const liveTrackingDeliveryPlan = useMemo(
    () =>
      buildManifestDeliveryPlan({
        tripDistance: detail.trip?.distance,
        mapRouteDistanceKm,
        routeEtaSeconds: manifestRouteEtaSeconds,
        estimatedDuration: detail.trip?.estimated_duration,
        startedAt: detail.trip?.started_at,
        pickupAt: detail.trip?.pickup_date,
        createdAt: detail.trip?.created_at,
      }),
    [
      detail.trip?.distance,
      detail.trip?.estimated_duration,
      detail.trip?.started_at,
      detail.trip?.pickup_date,
      detail.trip?.created_at,
      mapRouteDistanceKm,
      manifestRouteEtaSeconds,
    ],
  );

  // Vault upload hooks — must run before loading/error early returns (Rules of Hooks).
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const readFileAsArrayBuffer = useCallback(
    async (uri: string): Promise<ArrayBuffer> => {
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        return response.arrayBuffer();
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64" as const,
      });
      return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    },
    [],
  );

  const handleVaultUpload = useCallback(
    async (doc: (typeof detail.computedTripDocs)[number]) => {
      const tripIdForUpload = detail.trip?.id;
      const uploaderId = detail.currentUserId;
      if (!tripIdForUpload || !uploaderId || uploadingDocId) return;

      const allowPdf = doc.category !== "driver";
      let uri: string | null = null;
      let fileName = `${doc.id}-${Date.now()}.jpg`;
      let mimeType = "image/jpeg";

      try {
        if (allowPdf) {
          const res = await DocumentPicker.getDocumentAsync({
            multiple: false,
            copyToCacheDirectory: true,
            type: ["application/pdf", "image/*"],
          });
          if (res.canceled || !res.assets?.[0]) return;
          const asset = res.assets[0];
          uri = asset.uri;
          fileName = asset.name || fileName;
          mimeType = asset.mimeType || "application/pdf";
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              "Permission required",
              "Photo library access is needed to attach this document.",
            );
            return;
          }
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.9,
          });
          if (res.canceled || !res.assets?.[0]) return;
          const asset = res.assets[0];
          uri = asset.uri;
          fileName = asset.fileName ?? fileName;
          mimeType = asset.mimeType ?? "image/jpeg";
        }

        if (!uri) return;
        setUploadingDocId(doc.id);
        const arrayBuffer = await readFileAsArrayBuffer(uri);
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          Alert.alert("Upload failed", "Could not read the selected file.");
          return;
        }

        const CATEGORY_TO_DOC_TYPE: Record<string, tripDocumentsService.TripDocumentType> = {
          driver: 'pod',
          trip: 'manifest',
          lr: 'lr',
        };
        const { error } = await tripDocumentsService.uploadTripDocument(
          tripIdForUpload,
          uploaderId,
          { arrayBuffer, fileName, mimeType },
          CATEGORY_TO_DOC_TYPE[doc.category ?? ''] ?? 'manifest',
        );
        if (error) {
          Alert.alert("Upload failed", error.message);
          return;
        }
        detail.handleRefresh();
      } catch (e) {
        Alert.alert(
          "Upload failed",
          e instanceof Error ? e.message : "Something went wrong.",
        );
      } finally {
        setUploadingDocId(null);
      }
    },
    [
      detail.trip?.id,
      detail.currentUserId,
      detail.handleRefresh,
      uploadingDocId,
      readFileAsArrayBuffer,
    ],
  );

  const handleLRUpload = useCallback(async () => {
    const tripIdForUpload = detail.trip?.id;
    const uploaderId = detail.currentUserId;
    const currentStatus = detail.trip?.status ?? '';
    if (!tripIdForUpload || !uploaderId || uploadingDocId) return;

    let uri: string | null = null;
    let fileName = `lr-${Date.now()}.pdf`;
    let mimeType = 'application/pdf';

    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ['application/pdf', 'image/*'],
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      uri = asset.uri;
      fileName = asset.name || fileName;
      mimeType = asset.mimeType || 'application/pdf';

      setUploadingDocId('lr');
      const arrayBuffer = await readFileAsArrayBuffer(uri);
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        Alert.alert('Upload failed', 'Could not read the selected file.');
        return;
      }

      const { error: uploadError } = await tripDocumentsService.uploadTripDocument(
        tripIdForUpload,
        uploaderId,
        { arrayBuffer, fileName, mimeType },
        'lr',
      );
      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        return;
      }

      // LR upload marks goods as in transit — advance status when trip is underway but not yet in_transit
      const advanceable = ['started', 'assigned', 'in_progress', 'picked_up', 's_out', 'source_out'].includes(
        currentStatus.toLowerCase(),
      );
      if (advanceable) {
        await updateTripStatus(tripIdForUpload, { status: 'in_transit' });
      }

      detail.handleRefresh();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setUploadingDocId(null);
    }
  }, [
    detail.trip?.id,
    detail.trip?.status,
    detail.currentUserId,
    detail.handleRefresh,
    uploadingDocId,
    readFileAsArrayBuffer,
  ]);

  const journeyLogs = useMemo((): ManifestJourneyLogEntry[] => {
    const tr = detail.trip;
    if (!tr) return [];
    const trail = detail.locationTrailWithNames ?? [];
    const locationPings =
      trail.length > 0
        ? trail
        : detail.tripLocationPoints.map((p) => ({
            ...p,
            locationName: null as string | null,
          }));
    return buildManifestJourneyLogs({
      trip: tr,
      assignmentAuditRows: detail.assignmentAuditRows,
      driverLocationAddress: detail.driverLocationAddress,
      driverLocation: detail.driverLocation,
      locationPings,
      simLogs: simLogEntries,
      simLocationByKey,
      locationLoadingLabel: MAP_LOCATION_LABEL_LOADING,
    });
  }, [
    detail.trip,
    detail.assignmentAuditRows,
    detail.driverLocation,
    detail.driverLocationAddress,
    detail.locationTrailWithNames,
    detail.tripLocationPoints,
    simLogEntries,
    simLocationByKey,
  ]);

  const manifestDriverPings = useMemo(() => {
    const trail = detail.locationTrailWithNames ?? [];
    const source =
      trail.length > 0
        ? trail
        : detail.tripLocationPoints.map((p) => ({
            ...p,
            locationName: null as string | null,
          }));
    return [...source]
      .reverse()
      .slice(0, MANIFEST_PULSE_PING_DISPLAY_MAX)
      .map((p) => ({
        recorded_at: p.recorded_at,
        locationName: "locationName" in p ? p.locationName : null,
      }));
  }, [detail.locationTrailWithNames, detail.tripLocationPoints]);

  const manifestPulseLastIndex = 4;
  const currentStepIndex = detail.trip
    ? getManifestCurrentStepIndex(detail.trip)
    : 0;
  const visibleJourneyLogs = useMemo(
    () => getVisibleManifestJourneyLogs(journeyLogs, currentStepIndex),
    [journeyLogs, currentStepIndex],
  );
  const manifestJourneyComplete = currentStepIndex >= manifestPulseLastIndex;

  const tripForAssignmentFlow = detail.trip;
  const canChangeManifestAssetsForNav =
    !!tripForAssignmentFlow &&
    detail.canAssign &&
    !isTripCompleted(tripForAssignmentFlow);

  const openAssignmentFlow = useCallback(
    (focus: "driver" | "vehicle") => {
      if (!tripForAssignmentFlow?.id || !canChangeManifestAssetsForNav) return;
      router.push(ROUTES.tripAssignment(tripForAssignmentFlow.id, focus) as never);
    },
    [tripForAssignmentFlow?.id, canChangeManifestAssetsForNav, router],
  );

  const manifestHeroPartyContext = useMemo<AggregateTripKindPillContext>(
    () => ({
      viewerOrganizationId: currentOrganization?.id ?? null,
      supplierLinkedOrganizationId: detail.partnerOrgId ?? null,
    }),
    [currentOrganization?.id, detail.partnerOrgId],
  );
  const showManifestHeroDriver = useMemo(
    () =>
      detail.trip
        ? shouldShowManifestHeroDriverParty(
            detail.trip,
            manifestHeroPartyContext,
          )
        : false,
    [detail.trip, manifestHeroPartyContext],
  );

  if (detail.loading && !detail.trip) {
    return <CenteredLoadingView message="Loading trip…" />;
  }

  if (detail.error || !detail.trip) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>{detail.error ?? "Trip not found"}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={detail.load}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="refresh"
            size={14}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { trip } = detail;
  const expenseTabLabel = "Expense";
  const expenseHubLabel = "Expense Hub";
  const isAggregate = isAggregateTrip(trip);

  const driverSummaryText = (() => {
    const name = detail.driverName?.trim();
    const r = detail.driverRatingAvg;
    const hasScore = r != null && Number.isFinite(Number(r));
    if (!name && !hasScore) return null;
    const score = hasScore ? Number(r).toFixed(1) : "—";
    return `${name || "Driver"} — ${score} \u2605`;
  })();

  const openTripDirectionsInMaps = () => {
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    if (!o || !d) return;
    const url = `https://www.google.com/maps/dir/${o.latitude},${o.longitude}/${d.latitude},${d.longitude}`;
    void Linking.openURL(url);
  };
  const inlineReasonOptions = getInlineReasonOptions(
    inlineAdjType,
    inlineAdjImpact,
  );
  const inlineFinalReason =
    inlineAdjReason === "Other"
      ? inlineAdjOtherReason.trim() || "Other"
      : inlineAdjReason.trim();
  const inlineAmountNum = Math.round(
    parseFloat(inlineAdjAmount.replace(/,/g, "")) || 0,
  );
  const canSaveInlineAdjustment =
    inlineAmountNum > 0 && inlineFinalReason.length > 0;

  const openInlineAdjustmentForm = (preset?: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    reasonSeed?: string;
  }) => {
    setEditingProvisionAdjustmentId(null);
    if (preset) {
      setInlineAdjType(preset.type);
      setInlineAdjImpact(preset.impact);
      const seed = (preset.reasonSeed ?? "").trim();
      const opts =
        preset.type === "revenue"
          ? REVENUE_REASON_OPTIONS
          : COST_REASON_OPTIONS;
      if (seed && (opts as readonly string[]).includes(seed)) {
        setInlineAdjReason(seed);
        setInlineAdjOtherReason("");
      } else if (seed) {
        setInlineAdjReason("Other");
        setInlineAdjOtherReason(seed);
      } else {
        setInlineAdjReason("");
        setInlineAdjOtherReason("");
      }
    } else {
      setInlineAdjType("revenue");
      setInlineAdjImpact("plus");
      setInlineAdjReason("");
      setInlineAdjOtherReason("");
    }
    setInlineAdjAmount("");
    setShowInlineAdjustmentForm(true);
  };

  const beginInlineEditFromAdjustment = (adj: TripAdjustment) => {
    if (isAdjustmentVoided(adj)) return;
    setEditingProvisionAdjustmentId(adj.id);
    setInlineAdjType(adj.type);
    setInlineAdjImpact(adj.impact);
    setInlineAdjAmount(adj.amount > 0 ? String(adj.amount) : "");
    const opts =
      adj.type === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
    const r = (adj.reason ?? "").trim();
    if (r && (opts as readonly string[]).includes(r)) {
      setInlineAdjReason(r);
      setInlineAdjOtherReason("");
    } else if (r) {
      setInlineAdjReason("Other");
      setInlineAdjOtherReason(r);
    } else {
      setInlineAdjReason("");
      setInlineAdjOtherReason("");
    }
    setShowInlineAdjustmentForm(true);
  };

  const saveInlineAdjustment = async () => {
    if (!canSaveInlineAdjustment) return;
    if (editingProvisionAdjustmentId) {
      const existing = detail.adjustments.find(
        (a) => a.id === editingProvisionAdjustmentId,
      );
      if (existing && isAdjustmentVoided(existing)) return;
      await detail.handleUpdateAdjustment(editingProvisionAdjustmentId, {
        type: inlineAdjType,
        impact: inlineAdjImpact,
        amount: inlineAmountNum,
        reason: inlineFinalReason,
      });
      setEditingProvisionAdjustmentId(null);
    } else {
      await detail.handleSaveAdjustment({
        type: inlineAdjType,
        impact: inlineAdjImpact,
        amount: inlineAmountNum,
        reason: inlineFinalReason,
      });
    }
    setInlineAdjAmount("");
    setInlineAdjReason("");
    setInlineAdjOtherReason("");
    setShowInlineAdjustmentForm(false);
  };

  // ── Stage timestamps ──────────────────────────────────────────────────────────
  const stageTimestamps: TripStageTimestamp[] = [];
  if (trip.pickup_date)
    stageTimestamps.push({
      stageKey: "confirmed",
      timestamp: trip.pickup_date,
    });
  if (trip.started_at)
    stageTimestamps.push({ stageKey: "intransit", timestamp: trip.started_at });
  if (trip.completed_at)
    stageTimestamps.push({
      stageKey: "pod_received",
      timestamp: trip.completed_at,
    });

  const stageLocations: Partial<Record<string, string>> = {
    confirmed: trip.pickup_area?.trim() || undefined,
    s_in: trip.pickup_area?.trim() || undefined,
    s_out: trip.pickup_area?.trim() || undefined,
    d_in: trip.drop_location?.trim() || undefined,
    d_out: trip.drop_location?.trim() || undefined,
  };

  // ── Expense rows ──────────────────────────────────────────────────────────────
  const expenseRows: ExpenseRow[] = detail.tripLedgerEntries
    .filter((e) => Number(e.amount_out ?? 0) > 0)
    .map((e) => ({
      id: e.id,
      date: new Date(e.transaction_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      expenseId: e.id.replace(/-/g, "").slice(0, 10).toUpperCase(),
      category: e.primary_category ?? "Petty Cash",
      type: e.contact_type ?? e.party_name ?? "—",
      description: e.description ?? "—",
      amount: Number(e.amount_out),
      status: (e.reconciliation_status === "reconciled"
        ? "Paid"
        : e.reconciliation_status === "mismatch"
          ? "Requested"
          : "Pending") as ExpenseRow["status"],
    }));

  // ── Finance numbers ───────────────────────────────────────────────────────────
  // Keep POV parity with TripDetailFinanceView: supplier-side indent view should
  // use supplier settlement amounts, not client billing amounts.
  const isTripOwner =
    currentOrganization?.id != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganization.id;
  const isPartnerSettlementView = trip.indent_id != null && !isTripOwner;
  const payoutModeLc = String(trip.trip_payout_mode ?? "")
    .trim()
    .toLowerCase();
  /**
   * "Record supplier payout" is for **market / aggregate supply** (dispatcher pays an external supplier).
   * Integrated load **asset execution** (partner org is the supplier of record, roster / own fleet) must not
   * show this — those rows still often carry `supplier_id`, which wrongly made `resolveTripLedgerTripType`
   * infer `market` when `trip_payout_mode` was unset.
   */
  const showRecordSupplierPayoutCta =
    payoutModeLc !== "asset" &&
    entryContext !== "supplier" &&
    !isPartnerSettlementView &&
    (payoutModeLc === "market" || isTripOwner) &&
    resolveTripLedgerTripType(trip) === "market" &&
    !!(trip.supplier_id ?? "").trim();
  const customerSales = Number(trip.client_price ?? 0);
  const supplierCost = Number(trip.supplier_rate ?? 0);
  const sales = isPartnerSettlementView ? supplierCost : customerSales;
  const isAssetTripFinance = isAssetExecutionTrip(trip);
  const assetApprovedCostInr =
    tripOperationsSummaryQuery.data?.financialSnapshot?.approvedOperationalCostInr ?? 0;
  const assetDriverOffer = driverOfferFromDriverRow(
    assignedDriverCompQuery.data ?? null,
  );
  const assetCostEstimate =
    assetProvisionCostPreview?.totalBaseCostInr ??
    (assetApprovedCostInr > 0
      ? assetApprovedCostInr
      : isAssetTripFinance
        ? tripPayableCostTarget(
            trip,
            currentOrganization?.id ?? null,
            null,
            assetDriverOffer,
            null,
          )
        : 0);
  const cost = isPartnerSettlementView
    ? computePartnerIndentFreightCost(detail.subcontractRate)
    : isAssetTripFinance
      ? assetCostEstimate
      : supplierCost;
  const baseFreight = sales;
  const totalExpenses = isAssetTripFinance
    ? 0
    : expenseRows.reduce((s, r) => s + r.amount, 0);
  const incomeAdjustmentRows = adjustmentsCountingAsIncome(detail.adjustments);
  const deductionAdjustmentRows = adjustmentsCountingAsDeductions(
    detail.adjustments,
  );
  const additionalIncome = incomeAdjustmentRows.reduce(
    (s, a) => s + a.amount,
    0,
  );
  const deductions = deductionAdjustmentRows.reduce((s, a) => s + a.amount, 0);

  const received = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0,
  );
  const pending = Math.max(0, sales - received);

  const tripSettlement = computeTripSettlementDues({
    trip,
    viewerOrgId: currentOrganization?.id ?? null,
    ledgerEntries: detail.tripLedgerEntries,
    adjustments: detail.adjustments,
    subcontractRate: detail.subcontractRate ?? null,
    driverOffer: assetDriverOffer,
    assetProvisionCostInr: assetProvisionCostPreview?.totalBaseCostInr ?? null,
  });
  const collectedFromClient = tripSettlement.clientReceived;
  const supplierPaid = tripSettlement.payablePaid;
  const supplierDue = tripSettlement.payableDue;

  type FinanceHistoryRow = {
    key: string;
    tx: LedgerRow;
    isIn: boolean;
    amount: number;
  };
  const financeHistoryRows: FinanceHistoryRow[] = (() => {
    const rows: FinanceHistoryRow[] = [];
    for (const tx of detail.tripLedgerEntries) {
      const inAmt = Number(tx.amount_in ?? 0);
      const outAmt = Number(tx.amount_out ?? 0);
      if (inAmt > 0)
        rows.push({ key: `${tx.id}-in`, tx, isIn: true, amount: inAmt });
      if (outAmt > 0)
        rows.push({ key: `${tx.id}-out`, tx, isIn: false, amount: outAmt });
    }
    rows.sort((a, b) => {
      const da = new Date(a.tx.transaction_date || a.tx.created_at).getTime();
      const db = new Date(b.tx.transaction_date || b.tx.created_at).getTime();
      return db - da;
    });
    return rows;
  })();
  const driverCashPayoutsForExpenses = detail.tripLedgerEntries
    .filter(
      (tx) =>
        tx.contact_type === "driver" && Number(tx.amount_out ?? 0) > 0,
    )
    .map((tx) => ({
      id: tx.id,
      dateLabel: new Date(
        tx.transaction_date ?? tx.created_at ?? "",
      ).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      amount: Number(tx.amount_out ?? 0),
      description: tx.description,
    }));
  const driverReimbursementDueInr =
    tripOperationsSummaryQuery.data?.financialSnapshot?.payableOutstandingInr ?? 0;
  const paymentCaptured = detail.tripLedgerEntries.some(
    (row) => row.contact_type === "client" && Number(row.amount_in ?? 0) > 0,
  );

  // ── Map ───────────────────────────────────────────────────────────────────────
  const hasOrigin = !!detail.trackingMapOriginCoordinate;
  const hasDest = !!detail.trackingMapDestinationCoordinate;
  const mapCenter = hasOrigin
    ? {
        latitude: detail.trackingMapOriginCoordinate!.latitude,
        longitude: detail.trackingMapOriginCoordinate!.longitude,
      }
    : { latitude: 20.5937, longitude: 78.9629 };

  const tripExtra = trip as TripRow & TripWebExtra;
  const originSplit = splitLocationPrimarySecondary(trip.pickup_area);
  const destinationSplit = splitLocationPrimarySecondary(trip.drop_location);
  const originStateLabel =
    originSplit.secondary ||
    String(tripExtra.pickup_state ?? "").trim() ||
    "Origin Node";
  const destinationStateLabel =
    destinationSplit.secondary ||
    String(tripExtra.drop_state ?? "").trim() ||
    "Destination Node";
  const allocatedDriverName =
    detail.driverName?.trim() ||
    String(tripExtra.driver_name ?? "").trim() ||
    "Unassigned";
  const allocatedVehicleLabel =
    detail.displayVehicleFromInput?.trim() ||
    detail.vehicleLabel?.trim() ||
    String(trip.vehicle_display_number ?? "").trim() ||
    String(tripExtra.vehicle_number ?? "").trim() ||
    "Pending";

  const mapDbLocationTrail = mergeMapLocationTrail(
    detail.tripLocationPoints ?? [],
    (detail.trackingTrail ?? []).map((c) => ({
      latitude: c.latitude,
      longitude: c.longitude,
      recorded_at: c.recorded_at,
    })),
  );
  const mapTruckLocation = resolveMapTruckLocation({
    tripCompleted: detail.tripCompleted,
    currentPosition: trackingState?.currentPosition ?? null,
    driverLocation: detail.driverLocation ?? null,
    trail: mapDbLocationTrail,
  });
  const mapTruckStatus =
    detail.tripCompleted || !mapTruckLocation
      ? null
      : {
          truckNo: allocatedVehicleLabel,
          speed: 0,
          ignitionStatus: false,
          location: detail.driverLocationAddress?.trim() || undefined,
          lastUpdated:
            detail.driverLocation?.recorded_at ??
            trackingState?.lastSeenAt ??
            mapDbLocationTrail[mapDbLocationTrail.length - 1]?.recorded_at,
        };
  const driverLastPingRecordedAt =
    detail.driverLocation?.recorded_at ??
    trackingState?.lastSeenAt ??
    mapDbLocationTrail[mapDbLocationTrail.length - 1]?.recorded_at ??
    null;
  const driverLastPingDisplay = buildDriverLastPingDisplay({
    latitude: mapTruckLocation?.latitude ?? null,
    longitude: mapTruckLocation?.longitude ?? null,
    locationAddress: detail.driverLocationAddress,
    recordedAt: driverLastPingRecordedAt,
  });
  const awaitingDataLabel = t("tripsHubAwaitingData");
  const clientNameForParty =
    detail.displayClientName?.trim() ||
    String(trip.client_name ?? "").trim() ||
    awaitingDataLabel;
  const supplierNameForParty =
    detail.partnerName?.trim() ||
    String(tripExtra.supplier_name ?? "").trim() ||
    awaitingDataLabel;
  const clientNameCard = clientNameForParty.toUpperCase();
  const supplierName = supplierNameForParty.toUpperCase();
  const isIntegratedTrip = Boolean(trip.indent_id);

  // Next step the business can simulate
  const nextSimulateStep = (() => {
    const s = String(trip.status ?? "").toLowerCase();
    const loc = detail.driverLocation;
    const driverLat = loc?.latitude ?? null;
    const driverLng = loc?.longitude ?? null;
    const driverLocLabel = detail.driverLocationAddress?.trim() || null;
    const now = new Date().toISOString();
    if (s === "pending_acceptance")
      return {
        label: "Driver accepts assignment",
        targetStatus: "assigned",
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (["draft", "assigned"].includes(s))
      return {
        label: "Driver arrived at pickup",
        targetStatus: "in_progress",
        started_at: now,
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (["in_progress", "picked_up"].includes(s))
      return {
        label: "Package collected — in transit",
        targetStatus: "in_transit",
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (s === "in_transit")
      return {
        label: "Driver arrived at drop-off",
        targetStatus: "at_drop",
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (s === "at_drop")
      return {
        label: "Trip delivered & completed",
        targetStatus: "completed",
        completed_at: now,
        driverLat,
        driverLng,
        driverLocLabel,
      };
    return null;
  })();

  const previousStatusForSimTarget = (targetStatusRaw: string) => {
    const targetStatus = String(targetStatusRaw ?? "").trim().toLowerCase();
    if (!targetStatus) return null;
    if (targetStatus === "assigned") return "pending_acceptance";
    if (targetStatus === "in_progress") return "assigned";
    if (targetStatus === "picked_up") return "in_progress";
    if (targetStatus === "in_transit") return "in_progress";
    if (targetStatus === "at_drop") return "in_transit";
    if (targetStatus === "completed") return "at_drop";
    return null;
  };

  const lastSimulatedTransition = (() => {
    if (simLogEntries.length === 0) return null;
    const last = simLogEntries[simLogEntries.length - 1];
    if (!last?.status) return null;
    const toStatus = String(last.status).trim().toLowerCase();
    if (!toStatus) return null;
    const fallbackFrom = previousStatusForSimTarget(toStatus);
    const fromStatus = String(last.fromStatus ?? "")
      .trim()
      .toLowerCase();
    return {
      toStatus,
      fromStatus: fromStatus || fallbackFrom,
      lat: last.lat ?? null,
      lng: last.lng ?? null,
    };
  })();

  const currentTripStatusLower = String(trip.status ?? "").trim().toLowerCase();
  const canRevokeLastSimulation =
    !!lastSimulatedTransition?.toStatus &&
    currentTripStatusLower === lastSimulatedTransition.toStatus &&
    !!lastSimulatedTransition.fromStatus;

  // Execute simulation: advance status + append log marker to notes
  const handleConfirmSimulate = async () => {
    if (!simConfirmStep) return;
    setSimulating(true);
    setSimError(null);
    try {
      const updateData: {
        status: string;
        started_at?: string;
        completed_at?: string;
        status_change_origin?: string;
      } = {
        status: simConfirmStep.targetStatus,
        status_change_origin: "business_simulated",
      };
      if (simConfirmStep.started_at)
        updateData.started_at = simConfirmStep.started_at;
      if (simConfirmStep.completed_at)
        updateData.completed_at = simConfirmStep.completed_at;

      const { error } = await updateTripStatus(trip.id, updateData);
      if (error) {
        // Simulation fallback: allow final completion even when strict business validation
        // (e.g. supplier-link checks) blocks status transition in normal flows.
        if (simConfirmStep.targetStatus === "completed") {
          const fallbackUpdate: Record<string, unknown> = {
            status: "completed",
            completed_at: simConfirmStep.completed_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status_change_origin: "business_simulated",
          };
          if (simConfirmStep.started_at) {
            fallbackUpdate.started_at = simConfirmStep.started_at;
          }
          const { error: fallbackError } = await supabase()
            .from("trips")
            .update(fallbackUpdate)
            .eq("id", trip.id);
          if (fallbackError) {
            setSimError(fallbackError.message);
            setSimulating(false);
            return;
          }
        } else {
          setSimError(error.message);
          setSimulating(false);
          return;
        }
      }

      // DB trigger posts Trip System lines to `trip_messages`; refetch in-app trip chat
      // (realtime may be unavailable). Same pattern as ledger → chat bridge.
      notifyTripChatMessagesChanged();

      const userName = detail.profile?.full_name?.trim() || "Business";
      const simEntry = `[BISIM|${simConfirmStep.targetStatus}|${new Date().toISOString()}|${simConfirmStep.driverLat ?? ""}|${simConfirmStep.driverLng ?? ""}|${userName}|${String(trip.status ?? "").trim().toLowerCase()}]`;
      const existingNotes = trip.notes?.trim() || "";
      await supabase()
        .from("trips")
        .update({
          notes: existingNotes ? `${existingNotes}\n${simEntry}` : simEntry,
        })
        .eq("id", trip.id);

      setSimConfirmStep(null);
      detail.handleRefresh();
    } catch (e: unknown) {
      setSimError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const handleRevokeLastSimulation = async () => {
    if (!canRevokeLastSimulation || !lastSimulatedTransition?.fromStatus) return;
    setRevokingSimulation(true);
    setSimError(null);
    try {
      const revertToStatus = lastSimulatedTransition.fromStatus;
      const revertPayload = {
        status: revertToStatus,
        status_change_origin: "business_simulation_revoked",
      };
      const { error } = await updateTripStatus(trip.id, revertPayload);
      if (error) {
        const fallbackUpdate: Record<string, unknown> = {
          ...revertPayload,
          updated_at: new Date().toISOString(),
        };
        const { error: fallbackError } = await supabase()
          .from("trips")
          .update(fallbackUpdate)
          .eq("id", trip.id);
        if (fallbackError) {
          setSimError(fallbackError.message);
          return;
        }
      }

      // If we moved back from completion/in-progress stages, clear terminal timestamps.
      const cleanupPayload: Record<string, unknown> = {};
      if (revertToStatus !== "completed") cleanupPayload.completed_at = null;
      if (["pending_acceptance", "assigned", "draft"].includes(revertToStatus)) {
        cleanupPayload.started_at = null;
      }
      if (Object.keys(cleanupPayload).length > 0) {
        await supabase().from("trips").update(cleanupPayload).eq("id", trip.id);
      }

      notifyTripChatMessagesChanged();

      const userName = detail.profile?.full_name?.trim() || "Business";
      const loc = detail.driverLocation;
      const revokeLat = loc?.latitude ?? lastSimulatedTransition.lat ?? "";
      const revokeLng = loc?.longitude ?? lastSimulatedTransition.lng ?? "";
      const revokeEntry = `[BISIM_REVOKE|${currentTripStatusLower}|${revertToStatus}|${new Date().toISOString()}|${revokeLat}|${revokeLng}|${userName}]`;
      const existingNotes = trip.notes?.trim() || "";
      await supabase()
        .from("trips")
        .update({
          notes: existingNotes ? `${existingNotes}\n${revokeEntry}` : revokeEntry,
        })
        .eq("id", trip.id);

      detail.handleRefresh();
    } catch (e: unknown) {
      setSimError(e instanceof Error ? e.message : "Revoke simulation failed");
    } finally {
      setRevokingSimulation(false);
    }
  };

  const tripCompleted = isTripCompleted(trip);
  const canChangeManifestAssets = detail.canAssign && !tripCompleted;
  const canOpenReassign =
    canChangeManifestAssets && (!isAggregate || !reassignMigrationBlocked);
  const effectiveStatusLower = tripCompleted
    ? "completed"
    : String(trip.status ?? "assigned").toLowerCase();
  const hasAnyAssignment =
    !!trip.driver_id ||
    !!trip.vehicle_id ||
    !!String(trip.driver_display_name ?? "").trim() ||
    !!String(trip.vehicle_display_number ?? "").trim();
  const currentStatusLabel = (() => {
    const s = effectiveStatusLower;
    if (s === "assigned" && !hasAnyAssignment) return "UNASSIGNED";
    return s.replace(/_/g, " ").toUpperCase();
  })();
  const payoutModeLabel = (() => {
    if (!payoutModeLc) return "—";
    if (payoutModeLc === "asset") return "Asset";
    if (payoutModeLc === "market") return "Market";
    return payoutModeLc.replace(/_/g, " ");
  })();
  const paymentStatusLabel = (() => {
    const raw = String(trip.payment_status ?? "")
      .trim()
      .toLowerCase();
    if (!raw) return "—";
    return raw.replace(/_/g, " ");
  })();
  const loadTonsLabel = (() => {
    const n = Number(trip.load_tons ?? 0);
    return Number.isFinite(n) && n > 0 ? `${n} t` : "—";
  })();
  const advancePaidLabel = (() => {
    const n = Number(trip.advance_paid ?? 0);
    return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN")}` : "₹0";
  })();
  const amountPaidLabel = (() => {
    const n = Number(trip.amount_paid ?? 0);
    return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "₹0";
  })();

  const vehicleTypeLabel =
    String(tripExtra.vehicle_type ?? "").trim() ||
    String(tripExtra.truck_type ?? "").trim() ||
    "";
  const vehicleCapacityLabel =
    String(tripExtra.capacity ?? "").trim() ||
    String(tripExtra.vehicle_capacity ?? "").trim() ||
    "";
  const vehicleSpecsMeta = [vehicleTypeLabel, vehicleCapacityLabel]
    .filter(Boolean)
    .join(" · ") || null;

  const adjSales = adjustedRevenue(sales, detail.adjustments);
  const adjCost = adjustedCost(cost, detail.adjustments);
  const netManifestYield = selectTripManifestMargin({
    adjustedSaleInr: adjSales,
    adjustedCostInr: adjCost,
  });
  const marginBasisLabel = isAssetTripFinance
    ? "Client sale − trip cost"
    : "Client sale − supplier cost";
  const revenueSideDelta = adjSales - sales;
  const costSideDelta = adjCost - cost;
  const receivableAfterAdjustments = tripSettlement.receivableDue;
  const supplierDueAfterAdjustments = tripSettlement.payableDue;
  const provisionCostPartyName = isAssetTripFinance
    ? allocatedDriverName !== "Unassigned"
      ? allocatedDriverName
      : detail.driverName?.trim() || "Driver"
    : supplierNameForParty;
  const clientPartyIntegrated = detail.clientPartyRes?.integrated ?? false;
  const supplierPartyIntegrated = detail.supplierPartyRes?.integrated ?? false;
  const hasLinkedClient = Boolean((clientIdFromContext ?? trip.client_id)?.trim());
  const showPayableSettlementLane =
    showRecordSupplierPayoutCta || isAssetTripFinance;
  const tripLedgerNavContext = {
    trip,
    router,
    displayClientName: detail.displayClientName ?? null,
    clientIdFromContext: clientIdFromContext ?? null,
    clientNameFromContext: clientNameFromContext ?? null,
    partnerName: detail.partnerName ?? null,
    driverDisplayName: detail.driverName ?? null,
  };
  const financeLayout = isDesktop ? "desktop" : "mobile";
  const openSettlementLanePreview = (lane: "receivable" | "payable") => {
    const payableEntityType = isAssetTripFinance ? "driver" : "supplier";
    const tx = latestTripSettlementLedgerEntry(
      detail.tripLedgerEntries,
      lane,
      payableEntityType,
    );
    if (tx) {
      setPreviewLedgerTx(tx);
      return;
    }
    setActiveTab("finance");
    setFinanceSubTab("transactions");
  };
  const financeCapturePaymentSlot = (
    <View style={neoStyles.capturePaymentSlot}>
      <TripPayableReceivableSummaryCard
        layout={financeLayout}
        showReceivable={hasLinkedClient || adjSales > 0}
        clientName={clientNameForParty}
        clientAvatarUrl={detail.clientPartyAvatarFields?.avatarUrl}
        clientAvatarSeed={
          detail.clientPartyAvatarFields?.avatarSeed ??
          clientIdFromContext ??
          trip.client_id ??
          null
        }
        clientOrganizationImageUrl={
          detail.clientPartyAvatarFields?.organizationImageUrl
        }
        clientOrganizationAvatarSeed={
          detail.clientPartyAvatarFields?.organizationAvatarSeed
        }
        clientIntegrated={clientPartyIntegrated}
        revisedReceivable={adjSales}
        collectedAmount={collectedFromClient}
        receivableDue={receivableAfterAdjustments}
        showPayable={showPayableSettlementLane}
        payablePartyName={provisionCostPartyName}
        payableAvatarUrl={
          isAssetTripFinance
            ? detail.driverAvatarUri
            : detail.supplierPartyAvatarFields?.avatarUrl
        }
        payableAvatarSeed={
          isAssetTripFinance
            ? (trip.driver_id ?? null)
            : (detail.supplierPartyAvatarFields?.avatarSeed ??
              trip.supplier_id ??
              null)
        }
        payableOrganizationImageUrl={
          isAssetTripFinance
            ? undefined
            : detail.supplierPartyAvatarFields?.organizationImageUrl
        }
        payableOrganizationAvatarSeed={
          isAssetTripFinance
            ? undefined
            : detail.supplierPartyAvatarFields?.organizationAvatarSeed
        }
        payableIntegrated={
          isAssetTripFinance ? undefined : supplierPartyIntegrated
        }
        payableEntityType={isAssetTripFinance ? "driver" : "supplier"}
        payableLaneLabel={isAssetTripFinance ? "Driver payable" : "Payable"}
        revisedPayable={adjCost}
        paidAmount={supplierPaid}
        payableDue={supplierDueAfterAdjustments}
        onPressReceivable={
          collectedFromClient > 0
            ? () => openSettlementLanePreview("receivable")
            : undefined
        }
        onPressPayable={
          supplierPaid > 0
            ? () => openSettlementLanePreview("payable")
            : undefined
        }
        receivableAction={
          <TouchableOpacity
            style={[
              neoStyles.laneActionBtn,
              neoStyles.laneActionBtnPrimary,
              financeLayout === "mobile" && neoStyles.laneActionBtnMobile,
            ]}
            onPress={() => {
              const dueHint = Math.max(0, Math.round(receivableAfterAdjustments));
              pushTripLedgerQuickEntry(
                {
                  ...tripLedgerNavContext,
                  ledgerSyncExtraParams: {
                    dueAmountIn: String(dueHint),
                  },
                },
                "client",
              );
            }}
            activeOpacity={0.88}
          >
            <Feather
              name="credit-card"
              size={financeLayout === "mobile" ? 13 : 14}
              color={Theme.buttonPrimaryText}
            />
            <Text
              style={[
                neoStyles.laneActionBtnText,
                financeLayout === "mobile" && neoStyles.laneActionBtnTextMobile,
              ]}
              numberOfLines={2}
            >
              Capture payment
            </Text>
          </TouchableOpacity>
        }
        receivableActionHint={
          !hasLinkedClient ? (
            <Text style={neoStyles.laneActionHint}>
              Link a client to pre-fill receipt
            </Text>
          ) : null
        }
        payableAction={
          showRecordSupplierPayoutCta ? (
            <TouchableOpacity
              style={[
                neoStyles.laneActionBtn,
                neoStyles.laneActionBtnDark,
                financeLayout === "mobile" && neoStyles.laneActionBtnMobile,
              ]}
              onPress={() => {
                const dueOut = Math.max(0, Math.round(supplierDueAfterAdjustments));
                pushTripLedgerQuickEntry(
                  {
                    ...tripLedgerNavContext,
                    ledgerSyncExtraParams: {
                      dueAmountOut: String(dueOut),
                    },
                  },
                  "supplier",
                );
              }}
              activeOpacity={0.88}
            >
              <Feather name="arrow-up-right" size={financeLayout === "mobile" ? 13 : 14} color="#fff" />
              <Text
                style={[
                  neoStyles.laneActionBtnText,
                  neoStyles.laneActionBtnDarkText,
                  financeLayout === "mobile" && neoStyles.laneActionBtnTextMobile,
                ]}
                numberOfLines={2}
              >
                Record supplier payout
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );

  const assetCostBreakdownLines =
    isAssetTripFinance && assetProvisionCostPreview
      ? buildAssetProvisionCostBreakdownLines(assetProvisionCostPreview)
      : undefined;

  const financeAdjustmentSummaryWrappedEl = (
    <TripFinanceAdjustmentsPanel
      layout={financeLayout}
      adjustments={detail.adjustments}
      sales={sales}
      adjSales={adjSales}
      revenueSideDelta={revenueSideDelta}
      cost={cost}
      adjCost={adjCost}
      costSideDelta={costSideDelta}
      clientName={clientNameForParty}
      clientAvatarUrl={detail.clientPartyAvatarFields?.avatarUrl}
      clientAvatarSeed={
        detail.clientPartyAvatarFields?.avatarSeed ??
        clientIdFromContext ??
        trip.client_id ??
        null
      }
      clientOrganizationImageUrl={
        detail.clientPartyAvatarFields?.organizationImageUrl
      }
      clientOrganizationAvatarSeed={
        detail.clientPartyAvatarFields?.organizationAvatarSeed
      }
      clientIntegrated={clientPartyIntegrated}
      supplierName={provisionCostPartyName}
      supplierAvatarUrl={
        isAssetTripFinance
          ? detail.driverAvatarUri
          : detail.supplierPartyAvatarFields?.avatarUrl
      }
      supplierAvatarSeed={
        isAssetTripFinance
          ? (trip.driver_id ?? null)
          : (detail.supplierPartyAvatarFields?.avatarSeed ??
            trip.supplier_id ??
            null)
      }
      supplierOrganizationImageUrl={
        isAssetTripFinance
          ? undefined
          : detail.supplierPartyAvatarFields?.organizationImageUrl
      }
      supplierOrganizationAvatarSeed={
        isAssetTripFinance
          ? undefined
          : detail.supplierPartyAvatarFields?.organizationAvatarSeed
      }
      supplierIntegrated={
        isAssetTripFinance ? undefined : supplierPartyIntegrated
      }
      isAssetExecution={isAssetTripFinance}
      costLaneLabel={isAssetTripFinance ? "Revised trip cost" : undefined}
      costBreakdownLines={assetCostBreakdownLines}
      lineMetaLabel={provisionLineMetaLabel}
      onOpenProvision={setShowFinanceProvisionPanel}
      onRequestDeduction={handleRequestCostDeduction}
      onViewNotePdf={(adj) => {
        const isSale = adj.type === "revenue";
        setProvisionNotePdfContext({
          adjustment: adj,
          tripCode: getTripDisplayNumber(trip, currentOrganization?.id),
          companyName: currentOrganization?.name?.trim() || "PULSE",
          partyName: isSale ? clientNameForParty : provisionCostPartyName,
          laneLabel: isSale ? "Sale" : "Cost",
          partyRole: isSale ? "Client" : isAssetTripFinance ? "Driver" : "Supplier",
          baseLaneAmount: isSale ? sales : cost,
          revisedLaneAmount: isSale ? adjSales : adjCost,
        });
      }}
      onEditAdjustment={openProvisionEdit}
      capturePaymentSlot={financeCapturePaymentSlot}
    />
  );

  /** Shared mobile + desktop: trip margin hero only (detail in adjustments panel below). */
  const financeManifestSummaryBlock = (
    <TripMarginHero
      amount={netManifestYield}
      basisLabel={marginBasisLabel}
      layout={isDesktop ? "desktop" : "mobile"}
    />
  );

  const showOdometerVerification = isAssetExecutionTrip(trip);
  const odometerPreviewEl = showOdometerVerification ? (
    <TripOdometerPreviewCard
      trip={trip}
      compact
      onRecordStart={() => openOdometerVerification("start")}
      onRecordEnd={() => openOdometerVerification("end")}
    />
  ) : null;

  const filteredFinanceRows = financeHistoryRows.filter((row) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const text = [
      ledgerHistoryTitle(row.tx, row.isIn),
      row.tx.description ?? "",
      row.tx.payment_mode ?? "",
      (row.tx as LedgerWebExtra).reference_no ?? "",
      formatLedgerDate(row.tx.transaction_date),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(q);
  });
  const vaultDocs = detail.computedTripDocs;
  const canUploadTripDocs =
    !!currentOrganization?.id &&
    !!trip.organization_id &&
    currentOrganization.id === trip.organization_id;

  const openDriverDetails = () => {
    if (!trip.driver_id) return;
    router.push(`/driver/${trip.driver_id}` as never);
  };

  const openVehicleDetails = () => {
    if (!trip.vehicle_id) return;
    router.push(`/vehicle/${trip.vehicle_id}` as never);
  };

  const openTripDocumentsFlow = () => {
    router.push(
      `/log-incoming-pods?tripId=${encodeURIComponent(trip.id)}` as never,
    );
  };

  const handleDocOpen = (doc: (typeof detail.computedTripDocs)[number]) => {
    const isUploaded = doc.status !== "Pending" || !!doc.storagePath;
    if (isUploaded) {
      detail.setSelectedDoc(doc);
      return;
    }
    if (canUploadTripDocs) {
      openTripDocumentsFlow();
      return;
    }
    if (doc.id === "vehicle-documents" && trip.vehicle_id) {
      router.push(`/vehicle/${trip.vehicle_id}` as never);
    }
  };

  /**
   * Press handler for the new vault cards. Branches:
   *  - Already uploaded → open preview (existing behavior).
   *  - Vehicle Document (pending) → open vehicle profile (vehicle docs aren't trip-scoped).
   *  - Trip Manifest / Driver POD (pending) → inline file picker → uploadTripDocument.
   *  - User can't upload (different org) → fall back to existing handleDocOpen.
   */
  const handleVaultCardPress = (
    doc: (typeof detail.computedTripDocs)[number],
  ) => {
    const isUploaded = doc.status !== "Pending" || !!doc.storagePath;
    if (isUploaded) {
      detail.setSelectedDoc(doc);
      return;
    }
    if (doc.id === "vehicle-documents") {
      if (trip.vehicle_id) {
        router.push(`/vehicle/${trip.vehicle_id}` as never);
      }
      return;
    }
    if (doc.id === "lr" || doc.category === "lr") {
      if (canUploadTripDocs) void handleLRUpload();
      return;
    }
    if (canUploadTripDocs) {
      void handleVaultUpload(doc);
      return;
    }
    handleDocOpen(doc);
  };

  const hasDriverAssigned = !!trip.driver_id;
  const hasVehicleAssigned =
    !!trip.vehicle_id || !!String(trip.vehicle_display_number ?? "").trim();
  const canGenerateAggregateOtp = hasDriverAssigned && hasVehicleAssigned;
  const otpLockedByTripProgress = ["in_progress", "in_transit"].includes(
    String(trip.status ?? "").toLowerCase(),
  );
  // True when a driver row is assigned but hasn't claimed the trip yet (user_id = null).
  // Dispatcher must share the OTP so the driver can self-link via the claim flow.
  const driverIsUnlinked = hasDriverAssigned && !detail.driverLinked;

  const aggregateOtpState = (() => {
    // Non-aggregate trip with an unlinked driver: show OTP so dispatcher can share it.
    if (!isAggregate && driverIsUnlinked) return "otp_pending";
    if (!isAggregate) return null;
    if (!canGenerateAggregateOtp) return "not_required";
    const status = String(trip.status ?? "").toLowerCase();
    if (status === "assigned") return "otp_pending";
    if (status === "in_progress" || status === "in_transit") return "verified";
    return "not_required";
  })();

  const handleResendOtp = async () => {
    if (
      !trip?.id ||
      otpResending ||
      (!canGenerateAggregateOtp && !driverIsUnlinked) ||
      otpLockedByTripProgress
    )
      return;
    setOtpResending(true);
    try {
      await regenerateTripOtp(trip.id);
      detail.handleAssignmentUpdated();
    } finally {
      setOtpResending(false);
    }
  };

  // ── Dashboard: computed values ─────────────────────────────────────────────
  const statusLower = effectiveStatusLower;
  const statusLabel =
    statusLower.includes("in_transit") || statusLower.includes("transit")
      ? "In Transit"
      : statusLower.includes("in_progress")
        ? "In Progress"
        : statusLower.includes("complet") ||
            statusLower.includes("deliver") ||
            statusLower === "done"
          ? "Completed"
          : statusLower === "assigned" && !hasAnyAssignment
            ? "Unassigned"
            : statusLower === "assigned"
              ? "Assigned"
              : statusLower === "pending"
                ? "Pending"
                : (trip.status ?? "Pending");
  const statusColor =
    statusLabel === "In Transit" || statusLabel === "In Progress"
      ? "#22c55e"
      : statusLabel === "Completed"
        ? "#60a5fa"
        : "#f59e0b";
  const timelineWatermarkAnimation = (() => {
    const isCompletedLike =
      statusLower === "at_drop" ||
      statusLower.includes("arrived") ||
      statusLower.includes("destination") ||
      statusLower.includes("complet") ||
      statusLower.includes("deliver") ||
      statusLower === "done";
    if (isCompletedLike) {
      return require("@/assets/Animated folder/truck-unloading.json");
    }
    if (statusLower.includes("in_transit") || statusLower.includes("transit")) {
      return require("@/assets/Animated folder/truck-2.json");
    }
    return require("@/assets/Animated folder/truck-loading.json");
  })();
  const timelineWatermarkKey = `manifest-watermark-${statusLower}`;
  const pickupStr = trip.pickup_date
    ? new Date(trip.pickup_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const fmtAuditDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso.slice(0, 16).replace("T", " ");
    }
  };
  void baseFreight;
  void additionalIncome;
  void deductions;
  void pending;
  void hasDest;
  void mapCenter;
  void isIntegratedTrip;
  void openDriverDetails;
  void openVehicleDetails;
  void fmtAuditDate;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Navigation bar ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.navBar,
          { paddingHorizontal: hPad },
          !isDesktop && styles.navBarMobile,
        ]}
      >
        {isDesktop ? (
          <>
            <View style={neoStyles.manifestNavLeft}>
              <TouchableOpacity
                onPress={onBack}
                style={neoStyles.manifestBackBtn}
                activeOpacity={0.8}
              >
                <FontAwesome name="chevron-left" size={13} color="#0f172a" />
              </TouchableOpacity>
              <View style={neoStyles.manifestNavDivider} />
              <View>
                <Text style={neoStyles.manifestNavKicker}>
                  Manifest Management
                </Text>
                <View style={neoStyles.manifestNavTitleRow}>
                  <Text style={neoStyles.manifestNavTripId} numberOfLines={1}>
                    {getTripDisplayNumber(trip, currentOrganization?.id)}
                  </Text>
                  <View style={neoStyles.manifestStatusBadge}>
                    <Text style={neoStyles.manifestStatusBadgeText}>
                      {statusLabel === "Completed"
                        ? "DEPLOYED"
                        : statusLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={neoStyles.manifestNavActions}>
              <TouchableOpacity
                style={neoStyles.auditBtn}
                activeOpacity={0.85}
                onPress={() => setShowTripAuditLog(true)}
                accessibilityRole="button"
                accessibilityLabel="Open trip activity"
              >
                <Feather name="clock" size={16} color="#94a3b8" />
                <Text style={neoStyles.auditBtnText}>Activity</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={neoStyles.manifestChatBtn}
                activeOpacity={0.85}
                onPress={() => void handleOpenTripChat()}
                accessibilityRole="button"
                accessibilityLabel={t("tripChatNeedsDriverTitle")}
              >
                <MessageSquare
                  size={18}
                  color={Theme.driverEmerald}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={neoStyles.manifestShareBtn}
                activeOpacity={0.85}
              >
                <Feather name="share-2" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={onBack}
              style={styles.navCircleBtn}
              activeOpacity={0.85}
            >
              <FontAwesome name="chevron-left" size={18} color="#0f172a" />
            </TouchableOpacity>
            <View style={styles.navMobileCenter}>
              <Text style={styles.navMobileKicker}>Trip history</Text>
              <View style={styles.navMobileTripRow}>
                <Text style={styles.navMobileTripId}>
                  {getTripDisplayNumber(trip, currentOrganization?.id)}
                </Text>
                <View style={styles.navMobilePulseRow}>
                  <View
                    style={[styles.navMobileDot, styles.navMobileDotEmerald]}
                  />
                  <View
                    style={[styles.navMobileDot, styles.navMobileDotIndigo]}
                  />
                </View>
              </View>
            </View>
            <View style={styles.navMobileRightActions}>
              <TouchableOpacity
                style={[styles.navCircleBtn, styles.navChatCircle]}
                activeOpacity={0.85}
                onPress={() => void handleOpenTripChat()}
                accessibilityRole="button"
                accessibilityLabel={t("tripChatNeedsDriverTitle")}
              >
                <MessageSquare
                  size={17}
                  color={Theme.driverEmerald}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navCircleBtn}
                activeOpacity={0.85}
              >
                <FontAwesome name="share-alt" size={16} color="#0f172a" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      {false && isDesktop ? (
        <View style={[styles.tabBar, { paddingHorizontal: hPad }]}>
          <TabButton
            label="Tracking"
            icon="map-marker"
            active={desktopTab === "tracking"}
            onPress={() => setActiveTab("tracking")}
            compact={false}
          />
          <TabButton
            label="Finance"
            icon="bar-chart"
            active={desktopTab === "finance"}
            onPress={() => setActiveTab("finance")}
            compact={false}
          />
        </View>
      ) : null}

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop,
          {
            padding: isDesktop ? 24 : isMobile ? 14 : 18,
            gap: isDesktop ? 24 : isMobile ? 12 : 16,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={detail.handleRefresh}
          />
        }
      >
        {!isDesktop ? (
          <>
            <View style={styles.refHeroCard}>
              <View style={styles.refHeroBgGlow} />
              <View style={styles.refHeroBridgeRow}>
                <View style={styles.refHeroBridgeCol}>
                  <View style={styles.refHeroBridgeIconWrap}>
                    <PartyAvatar
                      name={clientNameForParty}
                      entityType="client"
                      size={MANIFEST_HERO_AVATAR_MOBILE}
                      organizationImageUrl={
                        detail.clientPartyAvatarFields?.organizationImageUrl ??
                        undefined
                      }
                      organizationAvatarSeed={
                        detail.clientPartyAvatarFields
                          ?.organizationAvatarSeed ?? undefined
                      }
                      avatarUrl={
                        detail.clientPartyAvatarFields?.avatarUrl ?? undefined
                      }
                      avatarSeed={
                        detail.clientPartyAvatarFields?.avatarSeed ?? undefined
                      }
                      isIntegrated={clientPartyIntegrated}
                      showIntegrationBadge={false}
                    />
                  </View>
                  <View style={styles.refHeroBridgeTextCol}>
                    <Text style={styles.refHeroBridgeLabel}>CLIENT</Text>
                    <Text
                      style={styles.refHeroBridgeValue}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {clientNameCard}
                    </Text>
                  </View>
                </View>
                <View style={styles.refHeroBridgeSwap}>
                  <FontAwesome name="exchange" size={12} color="#64748b" />
                </View>
                {showManifestHeroDriver ? (
                  <ManifestHeroBridgePartyEnd
                    roleLabel="DRIVER"
                    partyName={allocatedDriverName}
                    entityType="driver"
                    avatarSize={MANIFEST_HERO_AVATAR_MOBILE}
                    avatarUrl={detail.driverAvatarUri}
                    avatarSeed={trip.driver_id}
                    vehicleLabel={allocatedVehicleLabel}
                    vehicleId={trip.vehicle_id}
                  />
                ) : (
                  <ManifestHeroBridgePartyEnd
                    roleLabel="SUPPLIER"
                    partyName={supplierName}
                    entityType="supplier"
                    avatarSize={MANIFEST_HERO_AVATAR_MOBILE}
                    avatarUrl={detail.supplierPartyAvatarFields?.avatarUrl}
                    avatarSeed={detail.supplierPartyAvatarFields?.avatarSeed}
                    organizationImageUrl={
                      detail.supplierPartyAvatarFields?.organizationImageUrl
                    }
                    organizationAvatarSeed={
                      detail.supplierPartyAvatarFields?.organizationAvatarSeed
                    }
                    isIntegrated={supplierPartyIntegrated}
                  />
                )}
              </View>
              <View style={styles.refHeroRouteRow}>
                <View
                  style={[
                    styles.refHeroRouteCol,
                    styles.refHeroRouteColJustify,
                  ]}
                >
                  <Text
                    style={[
                      styles.refHeroCity,
                      isMobile && styles.refHeroCityMobile,
                    ]}
                  >
                    {originSplit.primary.toUpperCase()}
                  </Text>
                  <Text style={styles.refHeroState}>
                    {originStateLabel.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.refHeroConnectorWrap}>
                  <View style={styles.refHeroToRow}>
                    <View style={styles.refHeroToDot} />
                    <View style={styles.refHeroToLine} />
                  </View>
                </View>
                <View
                  style={[
                    styles.refHeroRouteCol,
                    styles.refHeroRouteColRight,
                    styles.refHeroRouteColJustify,
                  ]}
                >
                  <Text
                    style={[
                      styles.refHeroCity,
                      isMobile && styles.refHeroCityMobile,
                      isMobile && styles.refHeroCityMobileDest,
                      Platform.OS === "web" &&
                        isMobile &&
                        styles.refHeroCityWebDest,
                      styles.refHeroCityRight,
                    ]}
                    numberOfLines={1}
                    {...(Platform.OS === "web"
                      ? {}
                      : {
                          adjustsFontSizeToFit: true as const,
                          minimumFontScale: 0.45,
                        })}
                  >
                    {destinationSplit.primary.toUpperCase()}
                  </Text>
                  <Text style={[styles.refHeroState, styles.refHeroStateRight]}>
                    {destinationStateLabel.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.refHeroMetaShell}>
                <View style={styles.refHeroMetaItem}>
                  <View style={styles.refHeroMetaIconWrap}>
                    <Feather name="navigation" size={12} color="#fff" />
                  </View>
                  <View>
                    <Text style={styles.refHeroMetaLabel}>Manifest range</Text>
                    <Text style={styles.refHeroMetaValue} numberOfLines={1}>
                      {resolvedDistanceLabel
                        ? resolvedDistanceLabel.replace(/\s*km$/i, " KM")
                        : "—"}
                    </Text>
                  </View>
                </View>
                <View style={styles.refHeroMetaDivider} />
                <View
                  style={[styles.refHeroMetaItem, styles.refHeroMetaItemRight]}
                >
                  <View>
                    <Text style={styles.refHeroMetaLabel}>ETA manifest</Text>
                    <Text style={styles.refHeroMetaValue} numberOfLines={1}>
                      {liveTrackingDeliveryPlan.driverEtaLabel}
                    </Text>
                  </View>
                  <View style={styles.refHeroMetaIconGhost}>
                    <Feather name="clock" size={12} color="#a5b4fc" />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.refAssetRow}>
              <ManifestRefAssetCard
                roleLabel="Driver"
                primaryText={allocatedDriverName}
                variant="driver"
                ratingAvg={manifestDriverInsights.ratingAvg}
                docsIssue={manifestDriverInsights.docsIssue}
                insightsLoading={manifestRefAssetInsights.isLoading}
                driverName={detail.driverName}
                driverAvatarUrl={detail.driverAvatarUri}
                driverId={trip.driver_id}
                showChange={canChangeManifestAssets}
                onChange={() => openAssignmentFlow("driver")}
              />
              <ManifestRefAssetCard
                roleLabel="Vehicle"
                primaryText={allocatedVehicleLabel}
                variant="vehicle"
                vehicleType={vehicleTypeLabel}
                docsIssue={manifestVehicleInsights.docsIssue}
                insightsLoading={manifestRefAssetInsights.isLoading}
                showChange={canChangeManifestAssets}
                onChange={() => openAssignmentFlow("vehicle")}
              />
            </View>

            <View style={styles.refTabShell}>
              <TouchableOpacity
                style={[
                  styles.refTabBtn,
                  activeTab === "trip" && styles.refTabBtnActive,
                ]}
                onPress={() => setActiveTab("trip")}
                activeOpacity={0.85}
              >
                <Feather
                  name="activity"
                  size={12}
                  color={activeTab === "trip" ? "#818cf8" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.refTabBtnText,
                    activeTab === "trip" && styles.refTabBtnTextActive,
                  ]}
                >
                  Journey
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.refTabBtn,
                  activeTab === "finance" && styles.refTabBtnActive,
                ]}
                onPress={() => setActiveTab("finance")}
                activeOpacity={0.85}
              >
                <Feather
                  name="credit-card"
                  size={12}
                  color={activeTab === "finance" ? "#818cf8" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.refTabBtnText,
                    activeTab === "finance" && styles.refTabBtnTextActive,
                  ]}
                >
                  Finance
                </Text>
              </TouchableOpacity>
              {!isAggregate ? (
                <TouchableOpacity
                  style={[
                    styles.refTabBtn,
                    activeTab === "expenses" && styles.refTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("expenses")}
                  activeOpacity={0.85}
                >
                  <Feather
                    name="dollar-sign"
                    size={12}
                    color={activeTab === "expenses" ? "#818cf8" : "#94a3b8"}
                  />
                  <Text
                    style={[
                      styles.refTabBtnText,
                      activeTab === "expenses" && styles.refTabBtnTextActive,
                    ]}
                  >
                    {expenseTabLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.refTabBtn,
                  activeTab === "docs" && styles.refTabBtnActive,
                ]}
                onPress={() => setActiveTab("docs")}
                activeOpacity={0.85}
              >
                <Feather
                  name="shield"
                  size={12}
                  color={activeTab === "docs" ? "#818cf8" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.refTabBtnText,
                    activeTab === "docs" && styles.refTabBtnTextActive,
                  ]}
                >
                  Vault
                </Text>
              </TouchableOpacity>
            </View>

            <PersistentTabPanel active={activeTab === "trip"}>
              <>
                {isTripTrackingActive(trip?.status, trip?.completed_at) ? (
                  <TripDetailTrackingHub
                    onOpenLiveTracking={() => detail.setShowTrackingModal(true)}
                    deliveryPlan={liveTrackingDeliveryPlan}
                    driverLastPing={driverLastPingDisplay}
                    recordedAt={driverLastPingRecordedAt}
                    broadcastActive={trackingState?.broadcastActive ?? false}
                  />
                ) : null}
                <View style={styles.refTimelineCard}>
                  {visibleJourneyLogs.map((log, index) => {
                    const expanded = expandedLog === index;
                    const isLast = index === visibleJourneyLogs.length - 1;
                    const isCurrent =
                      !manifestJourneyComplete && isLast;
                    const phase: "completed" | "current" | "pending" = isCurrent
                      ? "current"
                      : "completed";
                    const stepIndex = manifestStepIndexForLog(log.stepKey);
                    const stepSimLogs = manifestSimLogsForStepIndex(
                      stepIndex,
                      simLogEntries,
                    );
                    return (
                      <View
                        key={`${log.stepKey}-${index}`}
                        style={styles.refTimelineItemWrap}
                      >
                        {!isLast ? (
                          <View
                            style={[
                              styles.refTimelineConnector,
                              phase === "completed" && {
                                backgroundColor: "#40B876",
                              },
                            ]}
                          />
                        ) : null}
                        <TouchableOpacity
                          style={[
                            styles.refTimelineItem,
                            expanded && styles.refTimelineItemExpanded,
                          ]}
                          onPress={() =>
                            setExpandedLog(expanded ? null : index)
                          }
                          activeOpacity={0.9}
                        >
                          <View style={neoStyles.manifestPulseIconColumn}>
                            <ManifestPulseStepIcon phase={phase} />
                          </View>
                          <View style={styles.refTimelineBody}>
                            <View style={styles.refTimelineTop}>
                              <Text
                                style={styles.refTimelineStatus}
                                numberOfLines={1}
                              >
                                {log.status}
                              </Text>
                              <View style={styles.refTimelineTopRight}>
                                <Text style={styles.refTimelineTime}>
                                  {log.time}
                                </Text>
                                <FontAwesome
                                  name={
                                    expanded ? "chevron-up" : "chevron-down"
                                  }
                                  size={11}
                                  color="#94a3b8"
                                />
                              </View>
                            </View>
                            <Text style={styles.refTimelineLocation}>
                              {log.location}
                            </Text>
                            {log.locationCoords ? (
                              <Text style={styles.refTimelineCoords}>
                                {log.locationCoords}
                              </Text>
                            ) : null}
                            {expanded ? (
                              <Text style={styles.refTimelineDetails}>
                                {log.details}
                              </Text>
                            ) : null}
                            {expanded && stepIndex === 3 ? (
                              <ManifestDriverPingList
                                pings={manifestDriverPings}
                              />
                            ) : null}
                            {stepSimLogs.map((sim, si) => (
                              <View
                                key={`ref-sim-${si}`}
                                style={neoStyles.simLogBadge}
                              >
                                <Feather
                                  name="zap"
                                  size={10}
                                  color="#f59e0b"
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={neoStyles.simLogBadgeText}>
                                    Business simulated · {sim.userName}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.refDeliveredCard}>
                  <View>
                    <Text style={styles.refDeliveredLabel}>
                      {tripCompleted
                        ? "Final Audit Status"
                        : "Current Status"}
                    </Text>
                    <Text style={styles.refDeliveredValue}>
                      {tripCompleted
                        ? "DELIVERED SUCCESSFULLY"
                        : currentStatusLabel}
                    </Text>
                  </View>
                  <View style={styles.refDeliveredIconWrap}>
                    <FontAwesome
                      name={tripCompleted ? "check-circle" : "clock-o"}
                      size={20}
                      color="#fff"
                    />
                  </View>
                </View>

                <View style={styles.refFeedbackWrap}>
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? null}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={
                      detail.displayClientName ?? trip.client_name ?? null
                    }
                    clientPartyAvatarFields={detail.clientPartyAvatarFields}
                    supplierPartyAvatarFields={detail.supplierPartyAvatarFields}
                    paymentCaptured={paymentCaptured}
                    layoutVariant="registry"
                  />
                </View>
              </>
            </PersistentTabPanel>
            <PersistentTabPanel active={activeTab === "finance"}>
              <View style={styles.refFinanceWrap}>
                <View style={styles.refFinanceSubTabs}>
                  <TouchableOpacity
                    style={styles.refFinanceSubBtn}
                    onPress={() => setFinanceSubTab("summary")}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.refFinanceSubBtnText,
                        financeSubTab === "summary" &&
                          styles.refFinanceSubBtnTextActive,
                      ]}
                    >
                      Summary
                    </Text>
                    {financeSubTab === "summary" ? (
                      <View style={styles.refFinanceSubLine} />
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.refFinanceSubBtn}
                    onPress={() => setFinanceSubTab("transactions")}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.refFinanceSubBtnText,
                        financeSubTab === "transactions" &&
                          styles.refFinanceSubBtnTextActive,
                      ]}
                    >
                      Transactions
                    </Text>
                    {financeSubTab === "transactions" ? (
                      <View style={styles.refFinanceSubLine} />
                    ) : null}
                  </TouchableOpacity>
                </View>

                {financeSubTab === "summary" ? (
                  <>
                    {financeManifestSummaryBlock}
                    {financeAdjustmentSummaryWrappedEl}
                  </>
                ) : (
                  <>
                    <View style={styles.refFinanceSearchWrap}>
                      <Feather name="search" size={14} color="#94a3b8" />
                      <TextInput
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder="Audit transaction registry..."
                        placeholderTextColor="#94a3b8"
                        style={styles.refFinanceSearchInput}
                      />
                    </View>
                    {filteredFinanceRows.map((row) => (
                      <TouchableOpacity
                        key={row.key}
                        style={styles.refTxnRow}
                        activeOpacity={0.85}
                        onPress={() => setPreviewLedgerTx(row.tx)}
                        accessibilityRole="button"
                        accessibilityLabel="Preview transaction"
                      >
                        <View style={styles.refTxnLeft}>
                          <View
                            style={[
                              styles.refTxnIconWrap,
                              row.isIn
                                ? styles.refTxnIconIn
                                : styles.refTxnIconOut,
                            ]}
                          >
                            <Feather
                              name={
                                row.isIn ? "arrow-down-left" : "arrow-up-right"
                              }
                              size={16}
                              color={row.isIn ? Theme.primary : "#f43f5e"}
                            />
                          </View>
                          <View style={styles.refTxnTextWrap}>
                            <Text style={styles.refTxnLabel}>
                              {ledgerHistoryTitle(row.tx, row.isIn)}
                            </Text>
                            <Text style={styles.refTxnMeta}>
                              {formatLedgerDate(row.tx.transaction_date)} ·{" "}
                              {row.tx.payment_mode || "Wallet"}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.refTxnAmount,
                            row.isIn
                              ? styles.refTxnAmountIn
                              : styles.refTxnAmountOut,
                          ]}
                        >
                          {formatINR(row.amount)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
            </PersistentTabPanel>
            {!isAggregate ? (
              <PersistentTabPanel active={activeTab === "expenses"}>
              <View style={styles.refFinanceWrap}>
                {odometerPreviewEl}
                <Suspense fallback={<ActivityIndicator style={{ margin: 24 }} color="#818cf8" />}>
                <TripExpensesScreen
                  trip={trip}
                  embedded
                  onAddFuel={() => router.push(ROUTES.tripFuelEntry(trip.id) as never)}
                  onAddToll={() => router.push(ROUTES.tripTollEntry(trip.id) as never)}
                  onAddOtherExpense={() => router.push(ROUTES.tripOtherExpenseEntry(trip.id) as never)}
                  onEditExpense={(event) => {
                    const href = tripExpenseEntryEditRoute(trip.id, event.id);
                    if (href) router.push(href as never);
                  }}
                  driverCashPayouts={driverCashPayoutsForExpenses}
                  onRecordDriverPayment={
                    trip.driver_id
                      ? () =>
                          pushTripLedgerQuickEntry(
                            {
                              trip,
                              router,
                              displayClientName: detail.displayClientName ?? null,
                              clientIdFromContext: clientIdFromContext ?? null,
                              clientNameFromContext: clientNameFromContext ?? null,
                              partnerName: detail.partnerName ?? null,
                              driverDisplayName: detail.driverName ?? null,
                              ledgerSyncExtraParams: {
                                dueAmountOut:
                                  driverReimbursementDueInr > 0
                                    ? String(
                                        Math.round(driverReimbursementDueInr),
                                      )
                                    : undefined,
                              },
                            },
                            "driver",
                          )
                      : undefined
                  }
                />
                </Suspense>
              </View>
              </PersistentTabPanel>
            ) : null}
            <PersistentTabPanel active={activeTab === "docs"}>
              <View style={styles.refVaultWrap}>
                <View style={styles.refVaultHeader}>
                  <View style={styles.refVaultHeaderIcon}>
                    <Feather name="shield" size={16} color="#4D3636" />
                  </View>
                  <View>
                    <Text style={styles.refVaultTitle}>Asset Vault</Text>
                    <Text style={styles.refVaultSub}>
                      Operational Compliance Registry
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.refVaultGrid,
                    vaultDocs.length <= 3 && styles.refVaultGridThreeCol,
                  ]}
                >
                  {vaultDocs.map((doc) => {
                    const tone =
                      (doc.status as string) === "Missing"
                        ? "critical"
                        : doc.status === "Pending"
                          ? "pending"
                          : "ok";
                    const isUploadingThis = uploadingDocId === doc.id;
                    const isPending = doc.status === "Pending";
                    const refBtnLabel = isPending
                      ? canUploadTripDocs
                        ? "Upload"
                        : doc.id === "vehicle-documents" && trip.vehicle_id
                          ? "Open"
                          : "Pending"
                      : "View";
                    const refBtnIcon =
                      isPending && canUploadTripDocs
                        ? "upload"
                        : "external-link";
                    const statusChipStyle =
                      tone === "critical"
                        ? styles.refVaultStatusCritical
                        : tone === "pending"
                          ? styles.refVaultStatusPending
                          : styles.refVaultStatusOk;
                    return (
                      <View
                        key={doc.id}
                        style={[
                          styles.refVaultCard,
                          vaultDocs.length <= 3 && styles.refVaultCardThird,
                        ]}
                      >
                        <View style={styles.refVaultCardContent}>
                          <View
                            style={[
                              styles.refVaultCardIconWrap,
                              tone === "critical" && styles.refVaultCardIconCritical,
                              tone === "ok" && styles.refVaultCardIconOk,
                            ]}
                          >
                            <Feather
                              name={
                                tone === "critical" ? "alert-triangle" : "file-text"
                              }
                              size={13}
                              color={
                                tone === "critical"
                                  ? "#e11d48"
                                  : tone === "ok"
                                    ? "#059669"
                                    : "#64748b"
                              }
                            />
                          </View>
                          <Text
                            style={styles.refVaultCardTitle}
                            numberOfLines={2}
                          >
                            {doc.label}
                          </Text>
                          <View style={[styles.refVaultStatusChip, statusChipStyle]}>
                            <Text
                              style={styles.refVaultCardStatus}
                              numberOfLines={1}
                            >
                              {doc.status}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.refVaultViewBtn,
                            isPending &&
                              canUploadTripDocs &&
                              styles.refVaultViewBtnPrimary,
                          ]}
                          onPress={() => handleVaultCardPress(doc)}
                          activeOpacity={0.85}
                          disabled={isUploadingThis}
                        >
                          {isUploadingThis ? (
                            <LoadingIndicator size="small" color="#64748b" />
                          ) : (
                            <>
                              <Feather
                                name={refBtnIcon}
                                size={11}
                                color={
                                  isPending && canUploadTripDocs
                                    ? "#4D3636"
                                    : "#64748b"
                                }
                              />
                              <Text
                                style={[
                                  styles.refVaultViewText,
                                  isPending &&
                                    canUploadTripDocs &&
                                    styles.refVaultViewTextPrimary,
                                ]}
                              >
                                {refBtnLabel}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            </PersistentTabPanel>
          </>
        ) : null}

        {isDesktop ? (
          <View style={neoStyles.shell}>
            <View style={neoStyles.grid}>
              <View style={neoStyles.mainCol}>
                <View style={neoStyles.hero}>
                  <View style={neoStyles.heroGlow} />
                  <View style={neoStyles.heroBridge}>
                    <View style={neoStyles.heroParty}>
                      <PartyAvatar
                        name={clientNameForParty}
                        entityType="client"
                        size={MANIFEST_HERO_AVATAR_DESKTOP}
                        organizationImageUrl={
                          detail.clientPartyAvatarFields
                            ?.organizationImageUrl ?? undefined
                        }
                        organizationAvatarSeed={
                          detail.clientPartyAvatarFields
                            ?.organizationAvatarSeed ?? undefined
                        }
                        avatarUrl={
                          detail.clientPartyAvatarFields?.avatarUrl ?? undefined
                        }
                        avatarSeed={
                          detail.clientPartyAvatarFields?.avatarSeed ??
                          undefined
                        }
                        isIntegrated={clientPartyIntegrated}
                        showIntegrationBadge={false}
                      />
                      <View style={neoStyles.heroPartyText}>
                        <Text style={neoStyles.heroKicker}>CLIENT</Text>
                        <Text
                          style={neoStyles.heroPartyName}
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {clientNameCard}
                        </Text>
                      </View>
                    </View>
                    <View style={neoStyles.swapIcon}>
                      <FontAwesome name="exchange" size={11} color="#64748b" />
                    </View>
                    {showManifestHeroDriver ? (
                      <NeoManifestHeroBridgePartyEnd
                        roleLabel="DRIVER"
                        partyName={allocatedDriverName}
                        entityType="driver"
                        avatarSize={MANIFEST_HERO_AVATAR_DESKTOP}
                        avatarUrl={detail.driverAvatarUri}
                        avatarSeed={trip.driver_id}
                        vehicleLabel={allocatedVehicleLabel}
                        vehicleId={trip.vehicle_id}
                        styles={neoStyles}
                        partyStyles={manifestHeroBridgePartyStyles}
                      />
                    ) : (
                      <NeoManifestHeroBridgePartyEnd
                        roleLabel="SUPPLIER"
                        partyName={supplierName}
                        entityType="supplier"
                        avatarSize={MANIFEST_HERO_AVATAR_DESKTOP}
                        avatarUrl={detail.supplierPartyAvatarFields?.avatarUrl}
                        avatarSeed={
                          detail.supplierPartyAvatarFields?.avatarSeed
                        }
                        organizationImageUrl={
                          detail.supplierPartyAvatarFields?.organizationImageUrl
                        }
                        organizationAvatarSeed={
                          detail.supplierPartyAvatarFields
                            ?.organizationAvatarSeed
                        }
                        isIntegrated={supplierPartyIntegrated}
                        styles={neoStyles}
                        partyStyles={manifestHeroBridgePartyStyles}
                      />
                    )}
                  </View>

                  <View style={neoStyles.routeHeroRow}>
                    <View style={neoStyles.routeHeroSide}>
                      <Text style={neoStyles.routeHeroCity} numberOfLines={2}>
                        {originSplit.primary.toUpperCase()}
                      </Text>
                      <Text style={neoStyles.routeHeroSub}>
                        {originStateLabel.toUpperCase()}
                      </Text>
                    </View>
                    <View style={neoStyles.routeVector}>
                      <View style={neoStyles.routeVectorLine} />
                      <View style={neoStyles.routeVectorTruck}>
                        <Feather name="truck" size={15} color="#cbd5e1" />
                      </View>
                      <View style={neoStyles.routeVectorLine} />
                    </View>
                    <View
                      style={[
                        neoStyles.routeHeroSide,
                        neoStyles.routeHeroSideRight,
                      ]}
                    >
                      <Text
                        style={[neoStyles.routeHeroCity, neoStyles.alignRight]}
                        numberOfLines={2}
                      >
                        {destinationSplit.primary.toUpperCase()}
                      </Text>
                      <Text
                        style={[neoStyles.routeHeroSub, neoStyles.alignRight]}
                      >
                        {destinationStateLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={neoStyles.heroMetrics}>
                    <View style={neoStyles.heroMetric}>
                      <Text style={neoStyles.heroMetricLabel}>
                        Manifest Range
                      </Text>
                      <Text style={neoStyles.heroMetricValue}>
                        {resolvedDistanceLabel
                          ? resolvedDistanceLabel.replace(/\s*km$/i, " KM")
                          : "—"}
                      </Text>
                    </View>
                    <View style={neoStyles.heroMetricDivider} />
                    <View style={neoStyles.heroMetric}>
                      <Text style={neoStyles.heroMetricLabel}>
                        ETA Manifest
                      </Text>
                      <Text style={neoStyles.heroMetricValue}>
                        {liveTrackingDeliveryPlan.driverEtaLabel}
                      </Text>
                    </View>
                    <View style={neoStyles.heroMetricDivider} />
                    <View style={neoStyles.heroMetric}>
                      <Text style={neoStyles.heroMetricLabel}>Status</Text>
                      <Text
                        style={[
                          neoStyles.heroMetricValue,
                          { color: statusColor },
                        ]}
                      >
                        {statusLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={neoStyles.tabShell}>
                  {(
                    [
                      {
                        id: "trip" as const,
                        label: "Journey Log",
                        icon: "activity" as const,
                      },
                      {
                        id: "finance" as const,
                        label: "Finance Hub",
                        icon: "credit-card" as const,
                      },
                      ...(!isAggregate
                        ? [
                            {
                              id: "expenses" as const,
                              label: expenseHubLabel,
                              icon: "dollar-sign" as const,
                            },
                          ]
                        : []),
                      {
                        id: "docs" as const,
                        label: "Asset Vault",
                        icon: "shield" as const,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          neoStyles.neoTab,
                          active && neoStyles.neoTabActive,
                        ]}
                        onPress={() => setActiveTab(tab.id)}
                        activeOpacity={0.86}
                      >
                        <Feather
                          name={tab.icon}
                          size={15}
                          color={active ? "#818cf8" : "#94a3b8"}
                        />
                        <Text
                          style={[
                            neoStyles.neoTabText,
                            active && neoStyles.neoTabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {activeTab === "trip" ? (
                  <View
                    style={[
                      neoStyles.journeyGrid,
                      isMobile && neoStyles.journeyGridMobile,
                    ]}
                  >
                    <View
                      style={[
                        neoStyles.timelineCard,
                        isMobile && neoStyles.timelineCardMobile,
                      ]}
                    >
                      <View
                        pointerEvents="none"
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={[
                          neoStyles.timelineWatermarkWrap,
                          isMobile && neoStyles.timelineWatermarkWrapMobile,
                        ]}
                      >
                        <LottieView
                          key={timelineWatermarkKey}
                          source={timelineWatermarkAnimation}
                          autoPlay
                          loop
                          speed={0.85}
                          style={neoStyles.timelineWatermark}
                        />
                      </View>
                      <View style={neoStyles.timelineCardContent}>
                        <View
                          style={[
                            neoStyles.cardTitleRow,
                            isMobile && neoStyles.cardTitleRowMobile,
                          ]}
                        >
                          <View style={neoStyles.manifestPulseTitleGroup}>
                            <Activity size={24} color="#5856D6" strokeWidth={2.5} />
                            <Text
                              style={[
                                neoStyles.cardTitleDark,
                                isMobile && neoStyles.cardTitleDarkMobile,
                              ]}
                            >
                              MANIFEST PULSE
                            </Text>
                          </View>
                          <View style={neoStyles.simActions}>
                            {canRevokeLastSimulation ? (
                              <TouchableOpacity
                                style={[
                                  neoStyles.simBtn,
                                  neoStyles.simBtnRevoke,
                                  isMobile && neoStyles.simBtnMobile,
                                ]}
                                onPress={handleRevokeLastSimulation}
                                activeOpacity={0.85}
                                disabled={simulating || revokingSimulation}
                              >
                                {revokingSimulation ? (
                                  <LoadingIndicator size="small" color="#f59e0b" />
                                ) : (
                                  <Feather name="rotate-ccw" size={13} color="#f59e0b" />
                                )}
                                <Text
                                  style={[
                                    neoStyles.simBtnText,
                                    isMobile && neoStyles.simBtnTextMobile,
                                  ]}
                                >
                                  {revokingSimulation ? "Revoking…" : "Revoke Last"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                            {nextSimulateStep && !tripCompleted ? (
                              <TouchableOpacity
                                style={[neoStyles.simBtn, isMobile && neoStyles.simBtnMobile]}
                                onPress={() => setSimConfirmStep(nextSimulateStep)}
                                activeOpacity={0.85}
                                disabled={revokingSimulation}
                              >
                                <Zap size={14} color="#f59e0b" fill="#f59e0b" />
                                <Text
                                  style={[
                                    neoStyles.simBtnText,
                                    isMobile && neoStyles.simBtnTextMobile,
                                  ]}
                                >
                                  {nextSimulateStep.targetStatus === "completed"
                                    ? "Simulate Complete"
                                    : "Simulate"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                        {visibleJourneyLogs.map((log, index) => {
                          const expanded = expandedLog === index;
                          const isLast = index === visibleJourneyLogs.length - 1;
                          const isCurrent =
                            !manifestJourneyComplete && isLast;
                          const phase: "completed" | "current" | "pending" = isCurrent
                            ? "current"
                            : "completed";
                          const stepIndex = manifestStepIndexForLog(log.stepKey);
                          const stepSimLogs = manifestSimLogsForStepIndex(
                            stepIndex,
                            simLogEntries,
                          );
                          return (
                            <View
                              key={`${log.stepKey}-${index}`}
                              style={[
                                neoStyles.timelineItemWrap,
                                !isLast && neoStyles.timelineItemWrapSpaced,
                                isMobile &&
                                  !isLast &&
                                  neoStyles.timelineItemWrapSpacedMobile,
                              ]}
                            >
                              {!isLast ? (
                                <View
                                  style={[
                                    neoStyles.timelineConnector,
                                    { backgroundColor: "#40B876" },
                                  ]}
                                />
                              ) : null}
                              <TouchableOpacity
                                style={[
                                  neoStyles.timelineItem,
                                  isMobile && neoStyles.timelineItemMobile,
                                  expanded && neoStyles.timelineItemActive,
                                ]}
                                onPress={() =>
                                  setExpandedLog(expanded ? null : index)
                                }
                                activeOpacity={0.9}
                              >
                                <View style={neoStyles.manifestPulseIconColumn}>
                                  <ManifestPulseStepIcon phase={phase} />
                                </View>
                                <View style={neoStyles.timelineBody}>
                                  <View style={neoStyles.timelineTop}>
                                    <Text
                                      style={[
                                        neoStyles.timelineStatus,
                                        isMobile && neoStyles.timelineStatusMobile,
                                      ]}
                                    >
                                      {log.status}
                                    </Text>
                                    <Text
                                      style={[
                                        neoStyles.timelineTime,
                                        isMobile && neoStyles.timelineTimeMobile,
                                      ]}
                                    >
                                      {log.time}
                                    </Text>
                                  </View>
                                  <Text
                                    style={[
                                      neoStyles.timelineLocation,
                                      isMobile && neoStyles.timelineLocationMobile,
                                    ]}
                                    numberOfLines={expanded ? undefined : 2}
                                  >
                                    {log.location}
                                  </Text>
                                  {log.locationCoords ? (
                                    <Text
                                      style={[
                                        neoStyles.timelineLocationCoords,
                                        isMobile &&
                                          neoStyles.timelineLocationCoordsMobile,
                                      ]}
                                      numberOfLines={expanded ? undefined : 2}
                                    >
                                      {log.locationCoords}
                                    </Text>
                                  ) : null}
                                  {expanded ? (
                                    <Text style={neoStyles.timelineDetails}>
                                      {log.details}
                                    </Text>
                                  ) : null}
                                  {expanded && stepIndex === 3 ? (
                                    <ManifestDriverPingList pings={manifestDriverPings} />
                                  ) : null}
                                  {/* Business simulation log badges */}
                                  {stepSimLogs.map((sim, si) => (
                                    <View
                                      key={si}
                                      style={[
                                        neoStyles.simLogBadge,
                                        isMobile && neoStyles.simLogBadgeMobile,
                                      ]}
                                    >
                                      <Feather
                                        name="zap"
                                        size={10}
                                        color="#f59e0b"
                                      />
                                      <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text
                                          style={[
                                            neoStyles.simLogBadgeText,
                                            isMobile &&
                                              neoStyles.simLogBadgeTextMobile,
                                          ]}
                                        >
                                          Business simulated · {sim.userName}
                                        </Text>
                                        {sim.timestamp ? (
                                          <Text
                                            style={[
                                              neoStyles.simLogBadgeTime,
                                              isMobile &&
                                                neoStyles.simLogBadgeTimeMobile,
                                            ]}
                                          >
                                            {new Date(
                                              sim.timestamp,
                                            ).toLocaleTimeString("en-IN", {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>
                                  ))}
                                </View>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    {/* Business Simulate Confirmation Modal */}
                    {simConfirmStep ? (
                      <Modal
                        transparent
                        animationType="fade"
                        visible
                        onRequestClose={() => setSimConfirmStep(null)}
                      >
                        <View style={neoStyles.simModalBackdrop}>
                          <View style={neoStyles.simModal}>
                            <View style={neoStyles.simModalHeader}>
                              <Feather name="zap" size={18} color="#f59e0b" />
                              <Text style={neoStyles.simModalTitle}>
                                Simulate Stage
                              </Text>
                            </View>
                            <Text style={neoStyles.simModalAction}>
                              {simConfirmStep.label}
                            </Text>
                            <View style={neoStyles.simModalDivider} />
                            {simConfirmStep.driverLat != null ? (
                              <View style={neoStyles.simModalLocRow}>
                                <Feather
                                  name="map-pin"
                                  size={13}
                                  color="#10b981"
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={neoStyles.simModalLocLabel}>
                                    Driver location
                                  </Text>
                                  <Text
                                    style={neoStyles.simModalLocValue}
                                    numberOfLines={2}
                                  >
                                    {simConfirmStep.driverLocLabel ||
                                      `${simConfirmStep.driverLat.toFixed(5)}°N, ${simConfirmStep.driverLng?.toFixed(5) ?? "—"}°E`}
                                  </Text>
                                  <Text style={neoStyles.simModalLocCoords}>
                                    {simConfirmStep.driverLat.toFixed(5)}°N{" "}
                                    {simConfirmStep.driverLng?.toFixed(5) ??
                                      "—"}
                                    °E
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <Text style={neoStyles.simModalNoLoc}>
                                No driver GPS data available
                              </Text>
                            )}
                            {simError ? (
                              <Text style={neoStyles.simModalError}>
                                {simError}
                              </Text>
                            ) : null}
                            <View style={neoStyles.simModalBtns}>
                              <TouchableOpacity
                                style={neoStyles.simModalCancel}
                                onPress={() => {
                                  setSimConfirmStep(null);
                                  setSimError(null);
                                }}
                                activeOpacity={0.8}
                              >
                                <Text style={neoStyles.simModalCancelText}>
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  neoStyles.simModalConfirm,
                                  simulating && { opacity: 0.6 },
                                ]}
                                onPress={handleConfirmSimulate}
                                disabled={simulating}
                                activeOpacity={0.85}
                              >
                                {simulating ? (
                                  <LoadingIndicator
                                    size="small"
                                    color="#fff"
                                  />
                                ) : (
                                  <Feather name="zap" size={14} color="#fff" />
                                )}
                                <Text style={neoStyles.simModalConfirmText}>
                                  {simulating
                                    ? "Simulating…"
                                    : "Confirm Simulate"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </Modal>
                    ) : null}

                    <View style={neoStyles.radarCard}>
                      <View style={neoStyles.radarMapLayer}>
                        <WaitingForDriverLocationOverlay
                          visible={detail.waitingForNewDriverLocation}
                        />
                        <TripMap
                          source={(trip.pickup_area ?? "").trim() || undefined}
                          destination={
                            (trip.drop_location ?? "").trim() || undefined
                          }
                          sourceCoords={
                            detail.trackingMapOriginCoordinate ?? undefined
                          }
                          destCoords={
                            detail.trackingMapDestinationCoordinate ?? undefined
                          }
                          truckLocation={mapTruckLocation}
                          dbLocationTrail={mapDbLocationTrail}
                          truckStatus={mapTruckStatus}
                          height="100%"
                          onDistanceCalculated={setMapRouteDistanceKm}
                          tripId={trip.id}
                          trackingEnabled={trackingState?.broadcastActive ?? false}
                        />
                        {showDriverTrackingOfflineOverlay ? (
                          <DriverTrackingOfflineOverlay
                            variant="map"
                            showReassign={detail.canAssign}
                            onSendLoginReminder={detail.requestDriverPing}
                            onReassignDriver={() => setShowReassignSheet(true)}
                          />
                        ) : null}
                      </View>
                      {trackingState?.broadcastActive ? (
                        <View style={neoStyles.radarLive} pointerEvents="none">
                          <View style={neoStyles.radarLiveDot} />
                          <Text style={neoStyles.radarLiveText}>
                            Live Telemetry
                          </Text>
                        </View>
                      ) : journeyTrackingActive ? (
                        <View
                          style={[neoStyles.radarLive, neoStyles.radarHistory]}
                          pointerEvents="none"
                        >
                          <Text style={neoStyles.radarHistoryText}>
                            Route history
                          </Text>
                        </View>
                      ) : null}
                      {(trackingState?.broadcastActive ?? false) ? (
                        <TouchableOpacity
                          style={[
                            neoStyles.radarPingBtn,
                            isPingTimedOut && neoStyles.radarPingBtnTimedOut,
                            (trackingState?.isPinging ?? false) && neoStyles.radarPingBtnActive,
                          ]}
                          onPress={detail.requestDriverPing}
                          disabled={trackingState?.isPinging ?? false}
                          activeOpacity={0.75}
                        >
                          {(trackingState?.isPinging ?? false) ? (
                            <ActivityIndicator size="small" color="#60a5fa" />
                          ) : isPingTimedOut ? (
                            <Feather name="alert-circle" size={14} color="#f59e0b" />
                          ) : (
                            <Feather name="navigation" size={14} color="#60a5fa" />
                          )}
                          <Text
                            style={[
                              neoStyles.radarPingText,
                              isPingTimedOut && neoStyles.radarPingTextTimedOut,
                            ]}
                          >
                            {(trackingState?.isPinging ?? false)
                              ? "Pinging…"
                              : isPingTimedOut
                                ? "No response"
                                : "Ping Driver"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {journeyTrackingActive ? (
                        <TouchableOpacity
                          style={neoStyles.radarLiveTrackBtn}
                          onPress={() => detail.setShowTrackingModal(true)}
                          activeOpacity={0.75}
                        >
                          <Feather name="map-pin" size={14} color="#818cf8" />
                          <Text style={neoStyles.radarLiveTrackText}>
                            Live Tracking
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <View
                        style={[
                          neoStyles.radarBottom,
                          isMobile && neoStyles.radarBottomMobile,
                        ]}
                        pointerEvents="box-none"
                      >
                        <View style={neoStyles.radarBottomLeft}>
                          <Text style={neoStyles.radarMetaLabel}>
                            Driver location
                          </Text>
                          <Text
                            style={neoStyles.radarMetaValue}
                            numberOfLines={2}
                          >
                            {driverLastPingDisplay.locationLabel?.trim() ||
                              driverLastPingDisplay.cityLabel?.trim() ||
                              "—"}
                          </Text>
                        </View>
                        <View style={neoStyles.radarBottomRight}>
                          <Text style={neoStyles.radarMetaLabel}>
                            {driverLastPingDisplay.recordedAtLabel
                              ? "Last ping"
                              : "Distance / ETA"}
                          </Text>
                          {driverLastPingDisplay.recordedAtLabel ? (
                            <Text style={neoStyles.radarMetaTime}>
                              {driverLastPingDisplay.recordedAtLabel}
                            </Text>
                          ) : (
                            <Text style={neoStyles.radarSpeed}>
                              {resolvedDistanceLabel ?? "Calculating"}{" "}
                              <Text style={neoStyles.radarSpeedUnit}>
                                · ETA {liveTrackingDeliveryPlan.driverEtaLabel}
                              </Text>
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                ) : activeTab === "finance" ? (
                  <View style={neoStyles.financeStack}>
                    <View style={neoStyles.financeSubTabs}>
                      {(["summary", "transactions"] as const).map((sub) => {
                        const active = financeSubTab === sub;
                        return (
                          <TouchableOpacity
                            key={sub}
                            style={neoStyles.financeSubTab}
                            onPress={() => setFinanceSubTab(sub)}
                            activeOpacity={0.86}
                          >
                            <Text
                              style={[
                                neoStyles.financeSubTabText,
                                isDesktop && neoStyles.financeSubTabTextDesktop,
                                active && neoStyles.financeSubTabTextActive,
                              ]}
                            >
                              {sub}
                            </Text>
                            {active ? (
                              <View style={neoStyles.financeSubLine} />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {financeSubTab === "summary" ? (
                      <>
                        <View
                          style={[
                            neoStyles.financeSummaryTwoPane,
                            isDesktop && neoStyles.financeSummaryTwoPaneDesktop,
                          ]}
                        >
                          <View
                            style={[
                              neoStyles.financeSummaryPaneLeft,
                              isDesktop && neoStyles.financeSummaryPaneLeftDesktop,
                            ]}
                          >
                            <View
                              style={[
                                neoStyles.financeManifestInPane,
                                isDesktop && neoStyles.financeManifestInPaneDesktop,
                              ]}
                            >
                              {financeManifestSummaryBlock}
                              {financeAdjustmentSummaryWrappedEl}
                            </View>
                          </View>
                          <View
                            style={[
                              neoStyles.financeSummaryPaneRight,
                              isDesktop && neoStyles.financeSummaryPaneRightDesktop,
                            ]}
                          >
                            <View
                              style={[
                                neoStyles.financeLedgerPreviewCard,
                                isDesktop && neoStyles.financeLedgerPreviewCardDesktop,
                              ]}
                            >
                              <View style={neoStyles.financeLedgerPreviewHead}>
                                <Text
                                  style={[
                                    neoStyles.financeLedgerPreviewTitle,
                                    isDesktop && neoStyles.financeLedgerPreviewTitleDesktop,
                                  ]}
                                >
                                  Ledger snapshot
                                </Text>
                                <TouchableOpacity
                                  style={neoStyles.financeLedgerPreviewLink}
                                  onPress={() =>
                                    setFinanceSubTab("transactions")
                                  }
                                  activeOpacity={0.85}
                                  accessibilityRole="button"
                                  accessibilityLabel="View full transaction list"
                                >
                                  <Text
                                    style={
                                      neoStyles.financeLedgerPreviewLinkText
                                    }
                                  >
                                    View all
                                  </Text>
                                  <Feather
                                    name="chevron-right"
                                    size={14}
                                    color="#4D3636"
                                  />
                                </TouchableOpacity>
                              </View>
                              <Text
                                style={[
                                  neoStyles.financeLedgerPreviewSub,
                                  isDesktop && neoStyles.financeLedgerPreviewSubDesktop,
                                ]}
                              >
                                {financeHistoryRows.length === 0
                                  ? "No cash movements on this trip yet"
                                  : `${financeHistoryRows.length} movement${
                                      financeHistoryRows.length === 1 ? "" : "s"
                                    } · newest first`}
                              </Text>
                              <ScrollView
                                style={neoStyles.financeLedgerPreviewScroll}
                                contentContainerStyle={
                                  neoStyles.financeLedgerPreviewScrollContent
                                }
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                              >
                                {financeHistoryRows.length === 0 ? (
                                  <Text
                                    style={neoStyles.financeLedgerPreviewEmpty}
                                  >
                                    Trip ledger entries appear here when you
                                    record receipts or payouts.
                                  </Text>
                                ) : (
                                  financeHistoryRows.slice(0, 8).map((row) => (
                                    <TouchableOpacity
                                      key={row.key}
                                      style={[
                                        neoStyles.financePreviewTxnRow,
                                        isDesktop && neoStyles.financePreviewTxnRowDesktop,
                                      ]}
                                      activeOpacity={0.85}
                                      onPress={() => setPreviewLedgerTx(row.tx)}
                                      accessibilityRole="button"
                                      accessibilityLabel="Preview transaction"
                                    >
                                      <View
                                        style={[
                                          neoStyles.financePreviewTxnIcon,
                                          isDesktop && neoStyles.financePreviewTxnIconDesktop,
                                          row.isIn
                                            ? neoStyles.financePreviewTxnIconIn
                                            : neoStyles.financePreviewTxnIconOut,
                                        ]}
                                      >
                                        <Feather
                                          name={
                                            row.isIn
                                              ? "arrow-down-left"
                                              : "arrow-up-right"
                                          }
                                          size={isDesktop ? 16 : 14}
                                          color={
                                            row.isIn ? "#10b981" : "#f43f5e"
                                          }
                                        />
                                      </View>
                                      <View
                                        style={neoStyles.financePreviewTxnMid}
                                      >
                                        <Text
                                          style={[
                                            neoStyles.financePreviewTxnTitle,
                                            isDesktop &&
                                              neoStyles.financePreviewTxnTitleDesktop,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {ledgerHistoryTitle(row.tx, row.isIn)}
                                        </Text>
                                        <Text
                                          style={[
                                            neoStyles.financePreviewTxnMeta,
                                            isDesktop &&
                                              neoStyles.financePreviewTxnMetaDesktop,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {formatLedgerDate(
                                            row.tx.transaction_date,
                                          )}{" "}
                                          · {row.tx.payment_mode || "Wallet"}
                                        </Text>
                                      </View>
                                      <Text
                                        style={[
                                          neoStyles.financePreviewTxnAmt,
                                          isDesktop &&
                                            neoStyles.financePreviewTxnAmtDesktop,
                                          row.isIn
                                            ? neoStyles.financePreviewTxnAmtIn
                                            : neoStyles.financePreviewTxnAmtOut,
                                        ]}
                                      >
                                        {formatINR(row.amount)}
                                      </Text>
                                    </TouchableOpacity>
                                  ))
                                )}
                              </ScrollView>
                            </View>
                          </View>
                        </View>

                        {false && showFinanceProvisionPanel ? (
                          <View style={neoStyles.provisionPanel}>
                            <View style={neoStyles.provisionHeader}>
                              <View>
                                <Text style={neoStyles.provisionTitle}>
                                  Provision Adjustments
                                </Text>
                                <Text style={neoStyles.provisionSub}>
                                  {showFinanceProvisionPanel === "client"
                                    ? "Client sale adjustment"
                                    : "Supplier cost adjustment"}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() =>
                                  setShowFinanceProvisionPanel(null)
                                }
                                style={neoStyles.provisionClose}
                                activeOpacity={0.85}
                              >
                                <Feather name="x" size={18} color="#fff" />
                              </TouchableOpacity>
                            </View>
                            <View style={neoStyles.provisionChips}>
                              {FINANCE_PROTOCOL_CHIPS.map((chip) => (
                                <TouchableOpacity
                                  key={chip}
                                  style={neoStyles.provisionChip}
                                  onPress={() =>
                                    openInlineAdjustmentForm(
                                      showFinanceProvisionPanel === "supplier"
                                        ? protocolSupplierChipAdjustment(chip)
                                        : {
                                            type: "revenue",
                                            impact: "plus",
                                            reasonSeed: chip,
                                          },
                                    )
                                  }
                                  activeOpacity={0.86}
                                >
                                  <Text style={neoStyles.provisionChipText}>
                                    {chip}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            {showInlineAdjustmentForm ? (
                              <View style={neoStyles.provisionForm}>
                                <View style={neoStyles.provisionFormHead}>
                                  <View>
                                    <Text style={neoStyles.provisionFormTitle}>
                                      Add Adjustment
                                    </Text>
                                    <Text style={neoStyles.provisionFormMeta}>
                                      {`${inlineAdjType === "revenue" ? "Sale / revenue" : "Supplier cost"} · ${
                                        inlineAdjImpact === "plus"
                                          ? "Debit add-on"
                                          : "Credit deduction"
                                      }`}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={neoStyles.provisionFormClose}
                                    onPress={() =>
                                      setShowInlineAdjustmentForm(false)
                                    }
                                    activeOpacity={0.85}
                                  >
                                    <Feather
                                      name="x"
                                      size={14}
                                      color="#475569"
                                    />
                                  </TouchableOpacity>
                                </View>

                                <Text style={neoStyles.provisionInputLabel}>
                                  Amount
                                </Text>
                                <View style={neoStyles.provisionAmountRow}>
                                  <Text style={neoStyles.provisionCurrency}>
                                    ₹
                                  </Text>
                                  <TextInput
                                    value={inlineAdjAmount}
                                    onChangeText={setInlineAdjAmount}
                                    style={neoStyles.provisionAmountInput}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    maxLength={14}
                                  />
                                </View>

                                <Text style={neoStyles.provisionInputLabel}>
                                  Reason
                                </Text>
                                <View style={neoStyles.provisionReasonWrap}>
                                  {inlineReasonOptions.map((reason) => (
                                    <TouchableOpacity
                                      key={reason}
                                      style={[
                                        neoStyles.provisionReasonChip,
                                        inlineAdjReason === reason &&
                                          neoStyles.provisionReasonChipActive,
                                      ]}
                                      onPress={() => setInlineAdjReason(reason)}
                                      activeOpacity={0.82}
                                    >
                                      <Text
                                        style={[
                                          neoStyles.provisionReasonText,
                                          inlineAdjReason === reason &&
                                            neoStyles.provisionReasonTextActive,
                                        ]}
                                      >
                                        {reason}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>

                                {inlineAdjReason === "Other" ? (
                                  <TextInput
                                    value={inlineAdjOtherReason}
                                    onChangeText={setInlineAdjOtherReason}
                                    style={neoStyles.provisionOtherInput}
                                    placeholder="Describe reason..."
                                    placeholderTextColor="#94a3b8"
                                    maxLength={80}
                                  />
                                ) : null}

                                <TouchableOpacity
                                  style={[
                                    neoStyles.provisionSaveBtn,
                                    !canSaveInlineAdjustment &&
                                      neoStyles.provisionSaveBtnDisabled,
                                  ]}
                                  onPress={() => void saveInlineAdjustment()}
                                  disabled={!canSaveInlineAdjustment}
                                  activeOpacity={0.86}
                                >
                                  <Text style={neoStyles.provisionSaveText}>
                                    Save Adjustment
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <View style={neoStyles.txnList}>
                        {filteredFinanceRows.length === 0 ? (
                          <Text style={neoStyles.emptyText}>
                            No transaction rows found
                          </Text>
                        ) : (
                          filteredFinanceRows.map((row) => (
                            <TouchableOpacity
                              key={row.key}
                              style={neoStyles.txnRow}
                              activeOpacity={0.85}
                              onPress={() => setPreviewLedgerTx(row.tx)}
                              accessibilityRole="button"
                              accessibilityLabel="Preview transaction"
                            >
                              <View
                                style={[
                                  neoStyles.txnIcon,
                                  row.isIn
                                    ? neoStyles.txnIconIn
                                    : neoStyles.txnIconOut,
                                ]}
                              >
                                <Feather
                                  name={
                                    row.isIn
                                      ? "arrow-down-left"
                                      : "arrow-up-right"
                                  }
                                  size={20}
                                  color={row.isIn ? Theme.primary : "#f43f5e"}
                                />
                              </View>
                              <View style={neoStyles.txnInfo}>
                                <Text style={neoStyles.txnTitle}>
                                  {ledgerHistoryTitle(row.tx, row.isIn)}
                                </Text>
                                <Text style={neoStyles.txnMeta}>
                                  {formatLedgerDate(row.tx.transaction_date)} ·{" "}
                                  {row.tx.payment_mode || "Wallet"}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  neoStyles.txnAmount,
                                  row.isIn
                                    ? neoStyles.txnAmountIn
                                    : neoStyles.txnAmountOut,
                                ]}
                              >
                                {formatINR(row.amount)}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                ) : activeTab === "expenses" ? (
                  <View style={neoStyles.financeStack}>
                    {odometerPreviewEl}
                    <Suspense fallback={<ActivityIndicator style={{ margin: 24 }} color="#818cf8" />}>
                    <TripExpensesScreen
                      trip={trip}
                      embedded
                      onAddFuel={() => router.push(ROUTES.tripFuelEntry(trip.id) as never)}
                      onAddToll={() => router.push(ROUTES.tripTollEntry(trip.id) as never)}
                      onAddOtherExpense={() => router.push(ROUTES.tripOtherExpenseEntry(trip.id) as never)}
                      onEditExpense={(event) => {
                        const href = tripExpenseEntryEditRoute(trip.id, event.id);
                        if (href) router.push(href as never);
                      }}
                      driverCashPayouts={driverCashPayoutsForExpenses}
                      onRecordDriverPayment={
                        trip.driver_id
                          ? () =>
                              pushTripLedgerQuickEntry(
                                {
                                  trip,
                                  router,
                                  displayClientName: detail.displayClientName ?? null,
                                  clientIdFromContext: clientIdFromContext ?? null,
                                  clientNameFromContext: clientNameFromContext ?? null,
                                  partnerName: detail.partnerName ?? null,
                                  driverDisplayName: detail.driverName ?? null,
                                  ledgerSyncExtraParams: {
                                    dueAmountOut:
                                      driverReimbursementDueInr > 0
                                        ? String(
                                            Math.round(driverReimbursementDueInr),
                                          )
                                        : undefined,
                                  },
                                },
                                "driver",
                              )
                          : undefined
                      }
                    />
                    </Suspense>
                  </View>
                ) : (
                  <View style={neoStyles.vaultGrid}>
                    {vaultDocs.map((doc) => {
                      const isUploadingThis = uploadingDocId === doc.id;
                      const isPending = doc.status === "Pending";
                      const isVehicleDoc = doc.id === "vehicle-documents";
                      const btnLabel = isPending
                        ? canUploadTripDocs
                          ? "Upload"
                          : isVehicleDoc && trip.vehicle_id
                            ? "Open"
                            : "Pending"
                        : "Preview";
                      const btnIcon = isPending
                        ? canUploadTripDocs
                          ? "upload"
                          : isVehicleDoc && trip.vehicle_id
                            ? "external-link"
                            : "clock"
                        : "eye";
                      return (
                        <View key={doc.id} style={neoStyles.vaultCard}>
                          <Feather
                            name={isPending ? "upload-cloud" : "file-text"}
                            size={34}
                            color={isPending ? "#cbd5e1" : "#94a3b8"}
                          />
                          <Text style={neoStyles.vaultTitle} numberOfLines={2}>
                            {doc.label}
                          </Text>
                          <Text style={neoStyles.vaultSub}>{doc.status}</Text>
                          <TouchableOpacity
                            onPress={() => handleVaultCardPress(doc)}
                            style={[
                              neoStyles.vaultBtn,
                              isPending &&
                                canUploadTripDocs &&
                                neoStyles.vaultBtnUpload,
                            ]}
                            activeOpacity={0.85}
                            disabled={isUploadingThis}
                          >
                            {isUploadingThis ? (
                              <LoadingIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Feather
                                  name={btnIcon}
                                  size={12}
                                  color={
                                    isPending && canUploadTripDocs
                                      ? Theme.buttonPrimaryText
                                      : "#fff"
                                  }
                                />
                                <Text
                                  style={[
                                    neoStyles.vaultBtnText,
                                    isPending &&
                                      canUploadTripDocs &&
                                      neoStyles.vaultBtnTextUpload,
                                  ]}
                                >
                                  {btnLabel}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={neoStyles.sideCol}>
                <View style={neoStyles.sideCard}>
                  <View style={neoStyles.sideSection}>
                    <View style={neoStyles.sideHeading}>
                      <Feather name="activity" size={16} color="#cbd5e1" />
                      <Text style={neoStyles.sideHeadingText}>
                        Manifest Assets
                      </Text>
                    </View>
                    <ManifestRefAssetCard
                      desktop
                      roleLabel="Driver"
                      primaryText={allocatedDriverName}
                      variant="driver"
                      ratingAvg={manifestDriverInsights.ratingAvg}
                      docsIssue={manifestDriverInsights.docsIssue}
                      insightsLoading={manifestRefAssetInsights.isLoading}
                      driverName={detail.driverName}
                      driverAvatarUrl={detail.driverAvatarUri}
                      driverId={trip.driver_id}
                showChange={canChangeManifestAssets}
                      onChange={() => openAssignmentFlow("driver")}
                      style={neoStyles.assetCardWrap}
                    />
                    <ManifestRefAssetCard
                      desktop
                      roleLabel="Vehicle"
                      primaryText={allocatedVehicleLabel}
                      variant="vehicle"
                      vehicleType={vehicleTypeLabel}
                      docsIssue={manifestVehicleInsights.docsIssue}
                      insightsLoading={manifestRefAssetInsights.isLoading}
                      showChange={canChangeManifestAssets}
                      onChange={() => openAssignmentFlow("vehicle")}
                      style={neoStyles.assetCardWrap}
                    />
                  </View>
                </View>

                <View style={[neoStyles.sideCard, neoStyles.feedbackSideCard]}>
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? null}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={
                      detail.displayClientName ?? trip.client_name ?? null
                    }
                    clientPartyAvatarFields={detail.clientPartyAvatarFields}
                    supplierPartyAvatarFields={detail.supplierPartyAvatarFields}
                    paymentCaptured={detail.tripLedgerEntries.some(
                      (row) =>
                        row.contact_type === "client" &&
                        Number(row.amount_in ?? 0) > 0,
                    )}
                    layoutVariant="registry"
                    embeddedSidebar
                  />
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* ════════════════════ TRACKING TAB ════════════════════ */}
        {false && isDesktop && desktopTab === "tracking" && (
          <>
            {/* ── Hero Card ── */}
            <View style={dStyles.heroCard}>
              <View style={dStyles.heroLeft}>
                <View style={dStyles.heroTitleRow}>
                  <Text style={dStyles.heroTripId}>
                    {getTripDisplayNumber(trip, currentOrganization?.id)}
                  </Text>
                  <View
                    style={[dStyles.statusBadge, { borderColor: statusColor }]}
                  >
                    <View
                      style={[
                        dStyles.statusDot,
                        { backgroundColor: statusColor },
                      ]}
                    />
                    <Text style={[dStyles.statusText, { color: statusColor }]}>
                      {statusLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={dStyles.routeRow}>
                  <View style={dStyles.routeStop}>
                    <Text style={dStyles.routeLabel}>ORIGIN</Text>
                    <Text style={dStyles.routeCity} numberOfLines={1}>
                      {trip.pickup_area || "—"}
                    </Text>
                    <Text style={dStyles.routeDate}>{pickupStr}</Text>
                  </View>
                  <View style={dStyles.routeDivider}>
                    <View style={dStyles.routeLine} />
                    <FontAwesome
                      name="truck"
                      size={16}
                      color="rgba(100,116,139,0.65)"
                    />
                    <View style={dStyles.routeLine} />
                  </View>
                  <View style={dStyles.routeStop}>
                    <Text style={dStyles.routeLabel}>DESTINATION</Text>
                    <Text style={dStyles.routeCity} numberOfLines={1}>
                      {trip.drop_location || "—"}
                    </Text>
                    {trip.estimated_duration ? (
                      <Text style={dStyles.routeDate}>
                        EST: {trip.estimated_duration}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={dStyles.heroStats}>
                <View style={dStyles.statBox}>
                  <Text style={dStyles.statLabel}>DISTANCE</Text>
                  <Text style={dStyles.statValue}>
                    {resolvedDistanceLabel ?? "—"}
                  </Text>
                </View>
                <View style={dStyles.statDivider} />
                <View style={dStyles.statBox}>
                  <Text style={dStyles.statLabel}>STATUS</Text>
                  <Text style={[dStyles.statValue, { fontSize: 14 }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[dStyles.card, dStyles.snapshotCard]}>
              <View style={dStyles.cardHeader}>
                <FontAwesome
                  name="database"
                  size={14}
                  color="#60a5fa"
                  style={{ marginRight: 8 }}
                />
                <Text style={dStyles.cardTitle}>Trip Data Snapshot</Text>
              </View>
              <View style={dStyles.snapshotGrid}>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Client Name</Text>
                  <Text style={dStyles.snapshotValue} numberOfLines={2}>
                    {clientNameCard || "—"}
                  </Text>
                </View>
                {isAggregate ? (
                  <View style={dStyles.snapshotCell}>
                    <Text style={dStyles.snapshotLabel}>Supplier Name</Text>
                    <Text style={dStyles.snapshotValue} numberOfLines={2}>
                      {supplierName || "—"}
                    </Text>
                  </View>
                ) : null}
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Payment Status</Text>
                  <Text style={dStyles.snapshotValue}>
                    {paymentStatusLabel}
                  </Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Amount Paid</Text>
                  <Text style={dStyles.snapshotValue}>{amountPaidLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Advance Paid</Text>
                  <Text style={dStyles.snapshotValue}>{advancePaidLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Payout Mode</Text>
                  <Text style={dStyles.snapshotValue}>{payoutModeLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Load Tons</Text>
                  <Text style={dStyles.snapshotValue}>{loadTonsLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Estimated Duration</Text>
                  <Text style={dStyles.snapshotValue}>
                    {trip.estimated_duration
                      ? String(trip.estimated_duration)
                      : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Map ── */}
            <View style={dStyles.card}>
                <View style={dStyles.cardHeader}>
                  <FontAwesome
                    name="map"
                    size={14}
                    color="#60a5fa"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={dStyles.cardTitle}>Live Tracking</Text>
                  {detail.trackingMapOriginCoordinate &&
                    detail.trackingMapDestinationCoordinate && (
                      <TouchableOpacity
                        style={dStyles.openMapsBtn}
                        onPress={openTripDirectionsInMaps}
                        activeOpacity={0.8}
                      >
                        <Feather name="navigation" size={12} color="#60a5fa" />
                        <Text style={dStyles.openMapsBtnText}>Open Maps</Text>
                      </TouchableOpacity>
                    )}
                </View>
                <View style={dStyles.telemetryWrap}>
                  <WaitingForDriverLocationOverlay
                    visible={detail.waitingForNewDriverLocation}
                  />
                  <TripMap
                    source={(trip.pickup_area ?? "").trim() || undefined}
                    destination={(trip.drop_location ?? "").trim() || undefined}
                    sourceCoords={
                      detail.trackingMapOriginCoordinate ?? undefined
                    }
                    destCoords={
                      detail.trackingMapDestinationCoordinate ?? undefined
                    }
                    truckLocation={mapTruckLocation}
                    dbLocationTrail={mapDbLocationTrail}
                    truckStatus={mapTruckStatus}
                    height={mapHeight}
                    onDistanceCalculated={setMapRouteDistanceKm}
                    tripId={trip.id}
                    trackingEnabled={trackingState?.broadcastActive ?? false}
                  />
                  {showDriverTrackingOfflineOverlay ? (
                    <DriverTrackingOfflineOverlay
                      variant="map"
                      showReassign={detail.canAssign}
                      onSendLoginReminder={detail.requestDriverPing}
                      onReassignDriver={() => setShowReassignSheet(true)}
                    />
                  ) : null}
                </View>
              </View>

            {/* ── Driver / Vehicle + Documents ── */}
            {isAggregate && reassignMigrationBlocked ? (
              <View
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: Theme.warningMuted,
                  borderWidth: 1,
                  borderColor: Theme.warning,
                }}
              >
                <Text style={{ fontSize: 13, color: Theme.textPrimary, lineHeight: 18 }}>
                  Reassignment is unavailable until database migration 20260805140000 is
                  applied (preserves trip stage on reassign). Contact your admin to run db
                  push.
                </Text>
              </View>
            ) : null}
            <View style={dStyles.row}>
              <View style={dStyles.bottomLeft}>
                <View style={dStyles.card}>
                  <View style={dStyles.cardHeaderRowInline}>
                    <Text style={dStyles.cardMicroLabel}>PRIMARY DRIVER</Text>
                    {canOpenReassign ? (
                      <TouchableOpacity
                        style={dStyles.reassignInlineBtn}
                        activeOpacity={0.85}
                        onPress={() => setShowReassignSheet(true)}
                      >
                        <Text style={dStyles.reassignInlineBtnText}>
                          Reassign
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={dStyles.driverRow}>
                    {detail.driverAvatarUri ? (
                      <Image
                        source={{ uri: detail.driverAvatarUri as string }}
                        style={dStyles.driverAvatar}
                      />
                    ) : (
                      <View style={dStyles.driverAvatarFallback}>
                        <FontAwesome
                          name="user"
                          size={20}
                          color={Theme.textSecondary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.driverName}>
                        {detail.driverName || "—"}
                      </Text>
                      {detail.driverRatingAvg != null && (
                        <Text style={dStyles.driverRating}>
                          ★ {Number(detail.driverRatingAvg).toFixed(1)}
                        </Text>
                      )}
                    </View>
                    {trip.started_at ? (
                      <View style={dStyles.statBoxSm}>
                        <Text style={dStyles.statLabelSm}>STARTED</Text>
                        <Text style={dStyles.statValueSm}>
                          {new Date(String(trip.started_at)).toLocaleTimeString(
                            "en-IN",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={dStyles.card}>
                  <View style={dStyles.cardHeaderRowInline}>
                    <Text style={dStyles.cardMicroLabel}>ASSIGNED VEHICLE</Text>
                    {canOpenReassign ? (
                      <TouchableOpacity
                        style={dStyles.reassignInlineBtn}
                        activeOpacity={0.85}
                        onPress={() => setShowReassignSheet(true)}
                      >
                        <Text style={dStyles.reassignInlineBtnText}>
                          Reassign
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={dStyles.vehicleRow}>
                    <View style={dStyles.vehicleIconWrap}>
                      <FontAwesome
                        name="truck"
                        size={20}
                        color={Theme.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.vehicleName}>
                        {detail.vehicleLabel ||
                          detail.displayVehicleFromInput ||
                          "—"}
                      </Text>
                      {trip.load_type ? (
                        <Text style={dStyles.vehicleSub}>{trip.load_type}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>

              <View style={[dStyles.card, dStyles.docsCol]}>
                <View style={dStyles.cardHeader}>
                  <FontAwesome
                    name="file-text-o"
                    size={14}
                    color="#60a5fa"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={dStyles.cardTitle}>Required Documents</Text>
                  <View style={dStyles.docsBadge}>
                    <Text style={dStyles.docsBadgeText}>
                      {
                        detail.computedTripDocs.filter(
                          (d) => d.status === "Uploaded",
                        ).length
                      }
                      /{detail.computedTripDocs.length} VERIFIED
                    </Text>
                  </View>
                </View>
                {detail.computedTripDocs.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={dStyles.docRow}
                    onPress={() => handleDocOpen(doc)}
                    activeOpacity={0.75}
                  >
                    <View style={dStyles.docIconWrap}>
                      <FontAwesome
                        name="file-o"
                        size={14}
                        color={Theme.textMuted}
                      />
                    </View>
                    <Text style={dStyles.docLabel} numberOfLines={1}>
                      {doc.label}
                    </Text>
                    <View
                      style={[
                        dStyles.docStatusPill,
                        doc.status === "Uploaded"
                          ? dStyles.docStatusVerified
                          : dStyles.docStatusPending,
                      ]}
                    >
                      <Text
                        style={[
                          dStyles.docStatusText,
                          doc.status === "Uploaded"
                            ? dStyles.docStatusTextVerified
                            : dStyles.docStatusTextPending,
                        ]}
                      >
                        {doc.status === "Uploaded" ? "VERIFIED" : "PENDING"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Placeholder for dead code path below — preserve existing view refs */}
            {false && (
              <View style={styles.workspaceRow}>
                <View style={styles.workspaceLeftCol}>
                  <View style={styles.voyageCard}>
                    <View style={styles.sectionKickerRow}>
                      <View style={styles.sectionKickerBar} />
                      <Text style={styles.sectionKicker}>Voyage Manifest</Text>
                    </View>
                    <View style={styles.routeLineWrap}>
                      <View style={styles.routeDotsCol}>
                        <View style={[styles.routeDot, styles.routeDotStart]} />
                        <View style={styles.routeDashedLine} />
                        <View style={[styles.routeDot, styles.routeDotEnd]} />
                      </View>
                      <View style={styles.routeTextCol}>
                        <Text style={styles.routePlace}>
                          {trip.pickup_area || "Pickup"}
                        </Text>
                        <Text style={styles.routePlace}>
                          {trip.drop_location || "Destination"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.voyageMetaGrid}>
                      <View style={styles.voyageMetaCell}>
                        <Text style={styles.voyageMetaLabel}>Client</Text>
                        <Text style={styles.voyageMetaValue}>
                          {detail.displayClientName || "—"}
                        </Text>
                      </View>
                      <View style={styles.voyageMetaCell}>
                        <Text style={styles.voyageMetaLabel}>Material</Text>
                        <Text style={styles.voyageMetaValue}>
                          {trip.load_type || "General Load"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.operatorCard}>
                    <View style={styles.operatorBadge}>
                      <FontAwesome name="user" size={16} color="#64748b" />
                      <View>
                        <Text style={styles.operatorLabel}>Operator</Text>
                        <Text style={styles.operatorValue}>
                          {detail.driverName || "Unassigned"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.operatorSub}>
                      {detail.vehicleLabel ||
                        detail.displayVehicleFromInput ||
                        "Vehicle pending assignment"}
                    </Text>
                  </View>

                  {trip.organization_id ? (
                    <TripAssignmentBlock
                      trip={trip}
                      organizationId={currentOrganization?.id ?? ""}
                      canAssign={detail.canAssign}
                      onUpdated={detail.handleAssignmentUpdated}
                      partnerName={detail.partnerName}
                      driverName={detail.driverName}
                      vehicleLabel={
                        isAggregate
                          ? detail.displayVehicleFromInput.trim() ||
                            detail.vehicleLabel ||
                            null
                          : detail.vehicleLabel
                      }
                      driverAvatarUri={detail.driverAvatarUri}
                      showAssignByPhone={detail.showAssignByPhone}
                      assignmentSource={detail.assignmentSource}
                      currentUserId={detail.currentUserId}
                      previousDriverName={detail.previousDriverName}
                      latestReassignmentSummary={
                        detail.latestReassignmentSummary
                      }
                      driverAssignOrgId={
                        isAggregate ? (currentOrganization?.id ?? null) : null
                      }
                      onVehicleDisplayChange={(value) => {
                        const normalized = formatIndianVehicleNumber(
                          value ?? "",
                        );
                        detail.setDisplayVehicleFromInput(normalized);
                      }}
                      inlineSection={
                        (isAggregate || driverIsUnlinked) ? (
                          <AggregateTripOtpPanel
                            variant="inline"
                            tripNumber={getTripDisplayNumber(trip, currentOrganization?.id)}
                            aggregateOtpState={aggregateOtpState}
                            canGenerateAggregateOtp={canGenerateAggregateOtp}
                            otpLockedByTripProgress={otpLockedByTripProgress}
                            tripOtp={detail.tripOtp}
                            onResendOtp={handleResendOtp}
                            otpResending={otpResending}
                          />
                        ) : null
                      }
                    />
                  ) : null}

                  <View style={styles.lrGrow}>
                    <Suspense fallback={<ActivityIndicator style={{ margin: 12 }} color="#818cf8" />}>
                    <LRDocumentsSection
                      presentation="gallery"
                      docs={detail.computedTripDocs.map((d) => {
                        const openable =
                          d.status !== "Pending" ||
                          !!d.storagePath ||
                          d.id === "vehicle-documents";
                        return {
                          id: d.id,
                          label: d.label,
                          type: d.type,
                          status:
                            d.status === "Verified" ? "Uploaded" : d.status,
                          onView: openable
                            ? () => detail.setSelectedDoc(d)
                            : undefined,
                        };
                      })}
                      onUpdateLR={() => void handleLRUpload()}
                      onAddDocument={openTripDocumentsFlow}
                    />
                    </Suspense>
                  </View>
                </View>

                <View style={styles.workspaceRightCol}>
                  <TripStatusTimeline
                    variant="journey"
                    trip={trip}
                    stageTimestamps={stageTimestamps}
                    stageLocations={stageLocations}
                    lastUpdatedAt={trip.updated_at}
                    canAdvance={detail.canAssign}
                    distanceKm={timelineDistanceKm}
                    driverSummaryText={driverSummaryText}
                    onOpenMaps={
                      detail.trackingMapOriginCoordinate &&
                      detail.trackingMapDestinationCoordinate
                        ? openTripDirectionsInMaps
                        : undefined
                    }
                    mapPreview={
                      <View style={styles.telemetryWrap}>
                        <WaitingForDriverLocationOverlay
                          visible={detail.waitingForNewDriverLocation}
                        />
                        <TripMap
                          source={(trip.pickup_area ?? "").trim() || undefined}
                          destination={
                            (trip.drop_location ?? "").trim() || undefined
                          }
                          sourceCoords={
                            detail.trackingMapOriginCoordinate ?? undefined
                          }
                          destCoords={
                            detail.trackingMapDestinationCoordinate ?? undefined
                          }
                          truckLocation={mapTruckLocation}
                          dbLocationTrail={mapDbLocationTrail}
                          truckStatus={mapTruckStatus}
                          height={520}
                          onDistanceCalculated={setMapRouteDistanceKm}
                          tripId={trip.id}
                          trackingEnabled={trackingState?.broadcastActive ?? false}
                        />
                        {showDriverTrackingOfflineOverlay ? (
                          <DriverTrackingOfflineOverlay
                            variant="map"
                            showReassign={detail.canAssign}
                            onSendLoginReminder={detail.requestDriverPing}
                            onReassignDriver={() => setShowReassignSheet(true)}
                          />
                        ) : null}
                        <View style={styles.telemetryOverlay}>
                          <FontAwesome
                            name="compass"
                            size={20}
                            color="#60a5fa"
                          />
                          <Text style={styles.telemetryTitle}>
                            Telemetry Link Secured
                          </Text>
                          <Text style={styles.telemetrySub}>
                            Protocol v4.2 synchronized live
                          </Text>
                        </View>
                      </View>
                    }
                  />
                </View>
              </View>
            )}

            {/* Location Log section */}
            {(detail.locationTrailWithNames ?? detail.tripLocationPoints).length > 0 && (
              <View style={styles.locationLogWrap}>
                <TouchableOpacity
                  style={styles.locationLogHeader}
                  onPress={() => setLocationLogExpanded((v) => !v)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={locationLogExpanded ? "Collapse location log" : "Expand location log"}
                >
                  <View style={styles.locationLogHeaderLeft}>
                    <Feather name="map-pin" size={13} color="#7c3aed" />
                    <Text style={styles.locationLogTitle}>Location log</Text>
                    <View style={styles.locationLogBadge}>
                      <Text style={styles.locationLogBadgeText}>
                        {(detail.locationTrailWithNames ?? detail.tripLocationPoints).length}
                      </Text>
                    </View>
                  </View>
                  <Feather
                    name={locationLogExpanded ? "chevron-up" : "chevron-down"}
                    size={15}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
                {locationLogExpanded && (
                  <ScrollView
                    style={styles.locationLogScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {(detail.locationTrailWithNames ?? detail.tripLocationPoints)
                      .slice()
                      .reverse()
                      .slice(0, 20)
                      .map((pt, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        const timeStr = pt.recorded_at
                          ? (() => {
                              try {
                                return new Date(pt.recorded_at).toLocaleString("en-IN", {
                                  timeZone: "Asia/Kolkata",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  day: "2-digit",
                                  month: "short",
                                  hour12: true,
                                });
                              } catch {
                                return "—";
                              }
                            })()
                          : "—";
                        const locationName =
                          "locationName" in pt
                            ? (pt as { locationName: string | null }).locationName
                            : null;
                        return (
                          <View key={`${pt.recorded_at ?? idx}-${idx}`} style={styles.locationLogRow}>
                            <View style={styles.locationLogTrack}>
                              <View style={styles.locationLogDot} />
                              {!isLast && <View style={styles.locationLogLine} />}
                            </View>
                            <View style={styles.locationLogContent}>
                              <Text style={styles.locationLogTime}>{timeStr}</Text>
                              <Text style={styles.locationLogName} numberOfLines={2}>
                                {locationName ?? "Resolving location…"}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Feedback / Ratings section */}
            {currentOrganization?.id && (
              <View style={styles.feedbackWrap}>
                {detail.tripCompleted ? (
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? null}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={
                      detail.displayClientName ?? trip.client_name ?? null
                    }
                    clientPartyAvatarFields={detail.clientPartyAvatarFields}
                    supplierPartyAvatarFields={detail.supplierPartyAvatarFields}
                    paymentCaptured={detail.tripLedgerEntries.some(
                      (row) =>
                        row.contact_type === "client" &&
                        Number(row.amount_in ?? 0) > 0,
                    )}
                    layoutVariant="registry"
                  />
                ) : (
                  <FeedbackPlaceholder />
                )}
              </View>
            )}
          </>
        )}

        {/* TripDetailFinanceView removed — was dead code ({false && …}) */}

        <View style={{ height: !isDesktop ? 120 : 48 }} />
      </ScrollView>

      {/* ── Modals (lazy-loaded: imported only when first rendered) ──────────── */}
      <Suspense fallback={null}>
      <ProvisionAdjustmentModal
        visible={!!showFinanceProvisionPanel}
        side={showFinanceProvisionPanel}
        onClose={closeFinanceProvisionModal}
        onSave={detail.handleSaveAdjustment}
        editTarget={provisionEditTarget}
        onUpdate={detail.handleUpdateAdjustment}
        tripCode={getTripDisplayNumber(trip, currentOrganization?.id)}
        partyLabel={
          showFinanceProvisionPanel === "client"
            ? (detail.displayClientName ?? trip.client_name ?? "Client")
            : isAssetTripFinance
              ? provisionCostPartyName
              : (detail.partnerName ?? trip.supplier_name ?? "Supplier")
        }
        clientName={clientNameForParty}
        clientAvatarSeed={clientIdFromContext ?? trip.client_id ?? null}
        supplierName={provisionCostPartyName}
        supplierAvatarSeed={
          isAssetTripFinance ? (trip.driver_id ?? null) : (trip.supplier_id ?? null)
        }
        sales={sales}
        adjSales={adjSales}
        cost={cost}
        adjCost={adjCost}
        revenueSideDelta={revenueSideDelta}
        costSideDelta={costSideDelta}
        isAssetExecution={isAssetTripFinance}
        costLaneLabel={isAssetTripFinance ? "Revised trip cost" : undefined}
        costBreakdownLines={assetCostBreakdownLines}
        adjustments={detail.adjustments}
        lineMetaLabel={provisionLineMetaLabel}
        onRequestDeduction={handleRequestCostDeduction}
      />

      <ProvisionDeductionConfirmModal
        visible={pendingCostDeduction !== null}
        recommendation={pendingCostDeduction}
        isAssetExecution={isAssetTripFinance}
        costPartyName={provisionCostPartyName}
        adjCost={adjCost}
        submitting={costDeductionSubmitting}
        onCancel={() => {
          if (!costDeductionSubmitting) setPendingCostDeduction(null);
        }}
        onConfirm={() => void handleConfirmCostDeduction()}
      />

      <ProvisionNotePdfModal
        visible={provisionNotePdfContext !== null}
        context={provisionNotePdfContext}
        onClose={() => setProvisionNotePdfContext(null)}
        onEdit={
          provisionNotePdfContext &&
          !isAdjustmentVoided(provisionNotePdfContext.adjustment)
            ? (adj) => {
                setProvisionNotePdfContext(null);
                openProvisionEdit(adj);
              }
            : undefined
        }
      />

      {!useCompactAdjustmentWizard ? (
        <TripAdjustmentModal
          visible={detail.showAdjustmentModal}
          preset={detail.adjustmentModalPreset}
          onClose={detail.closeTripAdjustmentModal}
          onSave={detail.handleSaveAdjustment}
          tripCode={getTripDisplayNumber(trip, currentOrganization?.id)}
          entryContextLabel={
            trip
              ? `${getTripDisplayNumber(trip, currentOrganization?.id)} · ${
                  detail.adjustmentModalPreset?.type === "cost"
                    ? (detail.partnerName ?? trip.supplier_name ?? "Supplier")
                    : (detail.displayClientName ?? trip.client_name ?? "Client")
                }`
              : null
          }
        />
      ) : null}
      </Suspense>

      <Modal
        visible={provisionConfirm !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setProvisionConfirm(null);
          setProvisionVoidReason("");
        }}
      >
        <View style={neoStyles.provisionConfirmBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setProvisionConfirm(null);
              setProvisionVoidReason("");
            }}
          />
          <View style={neoStyles.provisionConfirmCard} pointerEvents="box-none">
            <Text style={neoStyles.provisionConfirmTitle}>
              {provisionConfirm?.mode === "delete"
                ? "Void adjustment?"
                : "Edit adjustment?"}
            </Text>
            {provisionConfirm ? (
              <>
                <View style={neoStyles.provisionConfirmBlock}>
                  <Text style={neoStyles.provisionConfirmLine}>
                    {provisionConfirm.adjustment.type === "revenue"
                      ? "Client sale"
                      : "Supplier cost"}{" "}
                    ·{" "}
                    {provisionConfirm.adjustment.impact === "plus"
                      ? "Debit note (DN)"
                      : "Credit note (CN)"}
                  </Text>
                  <Text style={neoStyles.provisionConfirmLine}>
                    Amount:{" "}
                    {provisionConfirm.adjustment.impact === "plus" ? "+" : "−"}
                    {formatINR(provisionConfirm.adjustment.amount)}
                  </Text>
                  <Text
                    style={neoStyles.provisionConfirmLine}
                    numberOfLines={3}
                  >
                    Reason:{" "}
                    {(provisionConfirm.adjustment.reason ?? "").trim() || "—"}
                  </Text>
                </View>
                {provisionConfirm.mode === "delete" ? (
                  <>
                    <Text style={neoStyles.provisionVoidReasonLabel}>
                      Reason for voiding
                    </Text>
                    <TextInput
                      value={provisionVoidReason}
                      onChangeText={setProvisionVoidReason}
                      placeholder="Required — why should this line be voided?"
                      placeholderTextColor="#94a3b8"
                      style={neoStyles.provisionVoidReasonInput}
                      multiline
                      maxLength={240}
                    />
                  </>
                ) : null}
                <Text style={neoStyles.provisionConfirmHint}>
                  {provisionConfirm.mode === "delete"
                    ? "The line stays in the list as struck-through with your note. Adjusted totals will exclude it."
                    : "Next you can change amount, credit/debit type, or reason in the form."}
                </Text>
              </>
            ) : null}
            <View style={neoStyles.provisionConfirmActions}>
              <TouchableOpacity
                style={neoStyles.provisionConfirmCancel}
                onPress={() => {
                  setProvisionConfirm(null);
                  setProvisionVoidReason("");
                }}
                activeOpacity={0.85}
              >
                <Text style={neoStyles.provisionConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  provisionConfirm?.mode === "delete"
                    ? neoStyles.provisionConfirmDanger
                    : neoStyles.provisionConfirmPrimary,
                  provisionConfirm?.mode === "delete" &&
                    !provisionVoidReason.trim() &&
                    neoStyles.provisionConfirmDangerDisabled,
                ]}
                disabled={
                  provisionConfirm?.mode === "delete" &&
                  !String(provisionVoidReason ?? "").trim()
                }
                onPress={() => {
                  if (!provisionConfirm) return;
                  if (provisionConfirm.mode === "delete") {
                    const r = String(provisionVoidReason ?? "").trim();
                    if (!r) return;
                    void detail.handleVoidAdjustment(
                      provisionConfirm.adjustment.id,
                      r,
                    );
                    setProvisionConfirm(null);
                    setProvisionVoidReason("");
                  } else {
                    const adj = provisionConfirm.adjustment;
                    setProvisionConfirm(null);
                    beginInlineEditFromAdjustment(adj);
                  }
                }}
                activeOpacity={0.88}
              >
                <Text style={neoStyles.provisionConfirmOkText}>
                  {provisionConfirm?.mode === "delete"
                    ? "Void line"
                    : "Continue"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ThemedAlertModal
        visible={detail.showDriverRejectedModal}
        title="Driver Rejected"
        message="The assigned driver has rejected this trip."
        onOk={() => detail.setShowDriverRejectedModal(false)}
        variant="warning"
      />

      {trip.organization_id ? (
        <ReassignSheet
          visible={showReassignSheet}
          onClose={() => setShowReassignSheet(false)}
          trip={trip}
          organizationId={currentOrganization?.id ?? trip.organization_id}
          isAggregate={isAggregate}
          canAssign={detail.canAssign}
          currentUserId={detail.currentUserId}
          driverAssignOrgId={isAggregate ? (currentOrganization?.id ?? null) : null}
          currentDriverName={detail.driverName}
          currentVehicleLabel={
            isAggregate
              ? detail.displayVehicleFromInput.trim() ||
                detail.vehicleLabel ||
                null
              : detail.vehicleLabel
          }
          onCompleted={detail.handleReassignCompleted}
          onReloadTrip={detail.load}
          onVehicleDisplayChange={(value) => {
            detail.setDisplayVehicleFromInput(formatIndianVehicleNumber(value ?? ""));
          }}
        />
      ) : null}

      <TripAuditLogPanel
        visible={showTripAuditLog}
        onClose={() => setShowTripAuditLog(false)}
        trip={trip}
        organizationId={currentOrganization?.id ?? trip.organization_id}
        currentUserId={detail.currentUserId}
        assignmentAuditRows={detail.assignmentAuditRows}
        assignmentDriverNames={detail.assignmentDriverNames}
        assignmentVehicleLabels={detail.assignmentVehicleLabels}
        timelineRows={detail.driverActivityTimelineRows ?? []}
        tripLedgerEntries={detail.tripLedgerEntries}
        driverDisplayName={detail.driverName}
      />

      <Modal
        visible={!!detail.selectedDoc}
        animationType="fade"
        transparent
        onRequestClose={() => detail.setSelectedDoc(null)}
      >
        <View style={styles.docModalBackdrop}>
          <View
            style={[
              styles.docModalCard,
              { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 },
            ]}
          >
            <View style={styles.docModalHeader}>
              <TouchableOpacity
                onPress={() => detail.setSelectedDoc(null)}
                style={styles.docModalCloseIcon}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <FontAwesome name="times" size={18} color="#0f172a" />
              </TouchableOpacity>
              <View style={styles.docModalTitleBlock}>
                <Text style={styles.docModalTitle} numberOfLines={2}>
                  {detail.isVehicleGalleryDoc
                    ? "Vehicle documents"
                    : (detail.selectedDoc?.label ?? "Document")}
                </Text>
                <Text style={styles.docModalSubtitle} numberOfLines={1}>
                  {detail.isVehicleGalleryDoc && detail.activeVehiclePreviewDoc
                    ? `${detail.vehiclePreviewIndex + 1}/${detail.vehiclePreviewDocs.length} · ${detail.activeVehiclePreviewDoc.label}`
                    : "Preview"}
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>

            <View style={styles.docModalBody}>
              {detail.docPreviewLoading ? (
                <View style={styles.docModalCenter}>
                  <LoadingIndicator size="large" color={Theme.primary} />
                  <Text style={styles.docModalHint}>Loading preview…</Text>
                </View>
              ) : detail.isVehicleGalleryDoc ? (
                detail.vehiclePreviewDocs.length > 0 ? (
                  <View
                    style={styles.docGalleryWrap}
                    onLayout={(event) =>
                      setVehicleGalleryPageWidth(event.nativeEvent.layout.width)
                    }
                  >
                    <ScrollView
                      ref={vehicleGalleryScrollRef}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      scrollEventThrottle={16}
                      onScroll={(event) => {
                        const pageWidth =
                          event.nativeEvent.layoutMeasurement.width;
                        if (pageWidth <= 0) return;
                        const nextIndex = Math.round(
                          event.nativeEvent.contentOffset.x / pageWidth,
                        );
                        const clamped = Math.max(
                          0,
                          Math.min(
                            nextIndex,
                            detail.vehiclePreviewDocs.length - 1,
                          ),
                        );
                        if (clamped !== detail.vehiclePreviewIndex) {
                          detail.setVehiclePreviewIndex(clamped);
                        }
                      }}
                      onMomentumScrollEnd={(event) => {
                        const pageWidth =
                          event.nativeEvent.layoutMeasurement.width;
                        if (pageWidth <= 0) return;
                        const nextIndex = Math.round(
                          event.nativeEvent.contentOffset.x / pageWidth,
                        );
                        const clamped = Math.max(
                          0,
                          Math.min(
                            nextIndex,
                            detail.vehiclePreviewDocs.length - 1,
                          ),
                        );
                        if (clamped !== detail.vehiclePreviewIndex) {
                          detail.setVehiclePreviewIndex(clamped);
                        }
                      }}
                    >
                      {detail.vehiclePreviewDocs.map((doc) => {
                        const url = detail.vehiclePreviewUrls[doc.id] ?? null;
                        const isPdf = doc.type === "PDF";
                        const slideStyle = [
                          styles.docGallerySlide,
                          vehicleGalleryPageWidth > 0
                            ? { width: vehicleGalleryPageWidth }
                            : null,
                        ];
                        return (
                          <View key={doc.id} style={slideStyle}>
                            {url && !isPdf ? (
                              <Image
                                source={{ uri: url }}
                                style={styles.docModalImage}
                                resizeMode="contain"
                              />
                            ) : (
                              <View style={styles.docModalCenter}>
                                <FontAwesome
                                  name={url ? "file-pdf-o" : "file-o"}
                                  size={48}
                                  color={url ? Theme.primary : "#94a3b8"}
                                />
                                <Text style={styles.docModalHint}>
                                  {doc.label}
                                </Text>
                                <Text style={styles.docModalHint}>
                                  {url
                                    ? "PDF preview may be limited in the browser."
                                    : doc.storagePath
                                      ? "Generating secure link…"
                                      : "No document uploaded yet."}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>

                    {detail.vehiclePreviewDocs.length > 1 ? (
                      <>
                        <TouchableOpacity
                          accessibilityLabel="Previous document"
                          activeOpacity={0.85}
                          disabled={detail.vehiclePreviewIndex <= 0}
                          onPress={() =>
                            goToVehicleGalleryIndex(
                              detail.vehiclePreviewIndex - 1,
                            )
                          }
                          style={[
                            styles.docGalleryNavBtn,
                            styles.docGalleryNavBtnLeft,
                            detail.vehiclePreviewIndex <= 0 &&
                              styles.docGalleryNavBtnDisabled,
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <FontAwesome
                            name="chevron-left"
                            size={16}
                            color="#0f172a"
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          accessibilityLabel="Next document"
                          activeOpacity={0.85}
                          disabled={
                            detail.vehiclePreviewIndex >=
                            detail.vehiclePreviewDocs.length - 1
                          }
                          onPress={() =>
                            goToVehicleGalleryIndex(
                              detail.vehiclePreviewIndex + 1,
                            )
                          }
                          style={[
                            styles.docGalleryNavBtn,
                            styles.docGalleryNavBtnRight,
                            detail.vehiclePreviewIndex >=
                              detail.vehiclePreviewDocs.length - 1 &&
                              styles.docGalleryNavBtnDisabled,
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <FontAwesome
                            name="chevron-right"
                            size={16}
                            color="#0f172a"
                          />
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.docModalCenter}>
                    <FontAwesome name="file-o" size={48} color="#94a3b8" />
                    <Text style={styles.docModalHint}>
                      No vehicle document on file yet.
                    </Text>
                  </View>
                )
              ) : detail.docPreviewUrl ? (
                <Image
                  source={{ uri: detail.docPreviewUrl }}
                  style={styles.docModalImage}
                  resizeMode="contain"
                />
              ) : detail.docPreviewError ? (
                <View style={styles.docModalCenter}>
                  <FontAwesome
                    name="exclamation-triangle"
                    size={40}
                    color="#94a3b8"
                  />
                  <Text style={styles.docModalHint}>
                    Could not load this document.
                  </Text>
                </View>
              ) : (
                <View style={styles.docModalCenter}>
                  <FontAwesome name="file-o" size={48} color="#94a3b8" />
                  <Text style={styles.docModalHint}>
                    {detail.selectedDoc?.status === "Pending"
                      ? "This document has not been uploaded yet."
                      : "No preview available."}
                  </Text>
                </View>
              )}
            </View>

            {detail.isVehicleGalleryDoc &&
            detail.vehiclePreviewDocs.length > 1 ? (
              <View style={styles.docGalleryDots}>
                {detail.vehiclePreviewDocs.map((doc, index) => {
                  const isActive = index === detail.vehiclePreviewIndex;
                  return (
                    <TouchableOpacity
                      key={doc.id}
                      accessibilityLabel={`Go to document ${index + 1}`}
                      onPress={() => goToVehicleGalleryIndex(index)}
                      activeOpacity={0.85}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <View
                        style={[
                          styles.docGalleryDot,
                          isActive
                            ? styles.docGalleryDotActive
                            : styles.docGalleryDotInactive,
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.docModalFooter}>
              <TouchableOpacity
                style={styles.docModalFooterBtn}
                onPress={() => detail.setSelectedDoc(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.docModalFooterBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TripLedgerTransactionPreviewModal
        visible={previewLedgerTx != null}
        transaction={previewLedgerTx}
        onClose={() => setPreviewLedgerTx(null)}
        onViewAll={() => {
          setActiveTab("finance");
          setFinanceSubTab("transactions");
        }}
      />

      <Suspense fallback={null}>
        <LiveTrackingModal
          visible={detail.showTrackingModal ?? false}
          onClose={() => detail.setShowTrackingModal(false)}
          trip={trip}
          isDriverOffline={showDriverTrackingOfflineOverlay}
          onSendLoginReminder={detail.requestDriverPing}
          onReassignDriver={() => {
            detail.setShowTrackingModal(false);
            setShowReassignSheet(true);
          }}
          isClientIndentView={entryContext === "client"}
          trackingState={trackingState ?? defaultTrackingState}
          vehicleLabel={detail.vehicleLabel}
          locationLabels={detail.trackingMapLocationLabels}
          originCoordinate={detail.trackingMapOriginCoordinate}
          destinationCoordinate={detail.trackingMapDestinationCoordinate}
          tripLocationPoints={mapDbLocationTrail}
          mapTruckLocation={mapTruckLocation ?? null}
          mapDbLocationTrail={mapDbLocationTrail}
          mapTruckStatus={mapTruckStatus}
          trackingBroadcastActive={trackingState?.broadcastActive ?? false}
          lastPingRecordedAt={driverLastPingRecordedAt}
          locationAddress={detail.driverLocationAddress}
          driverActivityTimelineRows={detail.driverActivityTimelineRows}
          expandedTimelineEntryIds={detail.expandedTimelineEntryIds}
          onToggleTimelineItem={detail.toggleTimelineItemExpanded}
          assignmentDriverNames={detail.assignmentDriverNames}
          assignmentVehicleLabels={detail.assignmentVehicleLabels}
          driverName={detail.driverName}
          driverPhone={detail.driverPhone}
          currentUserId={detail.currentUserId}
          routeEtaSeconds={manifestRouteEtaSeconds}
          mapRouteDistanceKm={mapRouteDistanceKm}
          deliveryPlan={liveTrackingDeliveryPlan}
          displayClientName={
            detail.displayClientName ?? trip.client_name ?? null
          }
        />
      </Suspense>

      <TripChatRoomSheet
        visible={tripRoomOpen}
        tripId={trip.id}
        tripLabel={getTripDisplayNumber(trip, currentOrganization?.id)}
        onClose={() => setTripRoomOpen(false)}
        onViewTrip={() => setTripRoomOpen(false)}
      />

    </View>
  );
}

// ── Financial Ledger Card (dark) ───────────────────────────────────────────────

type FinanceHistoryRow = {
  key: string;
  tx: LedgerRow;
  isIn: boolean;
  amount: number;
};

function LedgerCard({
  sales,
  received,
  pending,
  totalExpenses,
  supplierPaid,
  supplierDue,
  financeHistoryRows,
  compact,
}: {
  sales: number;
  received: number;
  pending: number;
  totalExpenses: number;
  supplierPaid: number;
  supplierDue: number;
  financeHistoryRows: FinanceHistoryRow[];
  compact?: boolean;
}) {
  return (
    <View style={ldStyles.card}>
      {/* Header */}
      <View style={ldStyles.header}>
        <View style={ldStyles.headerLeft}>
          <FontAwesome name="book" size={12} color={Theme.primary} />
          <Text style={ldStyles.headerTitle}>FINANCIAL LEDGER</Text>
        </View>
        <View style={ldStyles.syncBadge}>
          <Text style={ldStyles.syncText}>Synced</Text>
        </View>
      </View>

      {/* Sale / Received / Due */}
      <View style={[ldStyles.statRow, compact && { flexWrap: "wrap", gap: 8 }]}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>
            Sale
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[ldStyles.statValue, compact && { fontSize: 13 }]}
          >
            {formatINR(sales)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <View style={ldStyles.statLabelRow}>
            <View style={ldStyles.greenDot} />
            <Text
              style={[ldStyles.statLabel, ldStyles.statLabelGreen]}
              numberOfLines={1}
            >
              Received
            </Text>
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              ldStyles.statValue,
              ldStyles.statValueGreen,
              compact && { fontSize: 13 },
            ]}
          >
            {formatINR(received)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>
            Due
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[ldStyles.statValue, compact && { fontSize: 13 }]}
          >
            {formatINR(pending)}
          </Text>
        </View>
      </View>

      {/* Asset Expenses / Paid / Payable */}
      <View style={[ldStyles.statRow, compact && { flexWrap: "wrap", gap: 8 }]}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>
            Asset Exp.
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[ldStyles.statValue, compact && { fontSize: 13 }]}
          >
            {formatINR(totalExpenses)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text
            style={[ldStyles.statLabel, ldStyles.statLabelRed]}
            numberOfLines={1}
          >
            Paid
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              ldStyles.statValue,
              ldStyles.statValueRed,
              compact && { fontSize: 13 },
            ]}
          >
            {formatINR(supplierPaid)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text
            style={[ldStyles.statLabel, ldStyles.statLabelOrange]}
            numberOfLines={1}
          >
            Payable
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              ldStyles.statValue,
              ldStyles.statValueOrange,
              compact && { fontSize: 13 },
            ]}
          >
            {formatINR(supplierDue)}
          </Text>
        </View>
      </View>

      {/* Transactions */}
      <View style={ldStyles.txSection}>
        <View style={ldStyles.txSectionHeader}>
          <Text style={ldStyles.txHeader}>RECENT TRANSACTIONS</Text>
          {financeHistoryRows.length > 0 && (
            <Text style={ldStyles.txViewAll}>View All →</Text>
          )}
        </View>

        {financeHistoryRows.length === 0 ? (
          <Text style={ldStyles.txEmpty}>
            No transactions for this trip yet
          </Text>
        ) : (
          financeHistoryRows.slice(0, 5).map(({ key, tx, isIn, amount }) => (
            <View key={key} style={ldStyles.txRow}>
              <View
                style={[
                  ldStyles.txIcon,
                  isIn ? ldStyles.txIconIn : ldStyles.txIconOut,
                ]}
              >
                <FontAwesome
                  name={isIn ? "arrow-down" : "arrow-up"}
                  size={11}
                  color={isIn ? Theme.positive : Theme.negative}
                />
              </View>
              <View style={ldStyles.txInfo}>
                <Text style={ldStyles.txTitle} numberOfLines={1}>
                  {ledgerHistoryTitle(tx, isIn)}
                </Text>
                <Text style={ldStyles.txMeta} numberOfLines={1}>
                  {formatLedgerDate(tx.transaction_date || tx.created_at)} ·{" "}
                  {tx.party_name?.trim() || "—"}
                </Text>
              </View>
              <Text
                style={[
                  ldStyles.txAmount,
                  isIn ? ldStyles.txAmountIn : ldStyles.txAmountOut,
                ]}
              >
                {isIn ? "+ " : "− "}
                {formatINR(amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ── Expense List Card (white) ──────────────────────────────────────────────────

function ExpenseListCard({
  expenses,
  onAddExpense,
}: {
  expenses: ExpenseRow[];
  onAddExpense?: () => void;
}) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  function getCategoryIcon(
    category: string,
  ): React.ComponentProps<typeof FontAwesome>["name"] {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol"))
      return "tint";
    if (c.includes("toll") || c.includes("road")) return "road";
    if (c.includes("driver") || c.includes("labour")) return "user";
    if (c.includes("maintenance") || c.includes("repair")) return "wrench";
    if (c.includes("loading") || c.includes("unloading")) return "archive";
    return "file-text-o";
  }

  function getCategoryColor(category: string): string {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol"))
      return "#f97316";
    if (c.includes("toll") || c.includes("road")) return "#3b82f6";
    if (c.includes("driver") || c.includes("labour")) return "#8b5cf6";
    if (c.includes("maintenance") || c.includes("repair")) return "#ef4444";
    return "#64748b";
  }

  return (
    <View style={elStyles.card}>
      <View style={elStyles.header}>
        <View style={elStyles.headerLeft}>
          <Text style={elStyles.title}>Trip Expenses</Text>
          {expenses.length > 0 && (
            <View style={elStyles.badge}>
              <Text style={elStyles.badgeText}>{expenses.length}</Text>
            </View>
          )}
        </View>
        <View style={elStyles.headerRight}>
          <Text style={elStyles.total}>{formatINR(total)}</Text>
          {onAddExpense && (
            <TouchableOpacity
              style={elStyles.addBtn}
              onPress={onAddExpense}
              activeOpacity={0.8}
            >
              <FontAwesome name="plus" size={10} color={Theme.textOnDark} />
              <Text style={elStyles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {expenses.length === 0 ? (
        <View style={elStyles.empty}>
          <FontAwesome name="inbox" size={24} color={Theme.textMuted} />
          <Text style={elStyles.emptyText}>No expenses recorded</Text>
        </View>
      ) : (
        <View style={elStyles.list}>
          {expenses.map((exp) => {
            const iconColor = getCategoryColor(exp.category);
            const iconName = getCategoryIcon(exp.category);
            const isPaid = exp.status === "Paid";
            return (
              <View key={exp.id} style={elStyles.item}>
                <View
                  style={[
                    elStyles.itemIcon,
                    { backgroundColor: iconColor + "18" },
                  ]}
                >
                  <FontAwesome name={iconName} size={16} color={iconColor} />
                </View>
                <View style={elStyles.itemInfo}>
                  <Text style={elStyles.itemTitle} numberOfLines={1}>
                    {exp.description !== "—" ? exp.description : exp.category}
                  </Text>
                  <Text style={elStyles.itemMeta} numberOfLines={1}>
                    {exp.date} · {exp.type}
                  </Text>
                </View>
                <View style={elStyles.itemRight}>
                  <Text style={elStyles.itemAmount}>
                    ₹{exp.amount.toLocaleString("en-IN")}
                  </Text>
                  <View
                    style={[
                      elStyles.itemStatus,
                      {
                        backgroundColor: isPaid ? "#dcfce7" : "#fef3c7",
                        borderColor: isPaid ? "#bbf7d0" : "#fde68a",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        elStyles.itemStatusText,
                        { color: isPaid ? "#15803d" : "#b45309" },
                      ]}
                    >
                      {exp.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Feedback placeholder ───────────────────────────────────────────────────────

function FeedbackPlaceholder() {
  return (
    <View style={fbStyles.card}>
      <View style={fbStyles.headerRow}>
        <View style={fbStyles.titleCluster}>
          <View style={fbStyles.awardCircle}>
            <Feather name="award" size={22} color={Theme.primary} />
          </View>
          <View style={fbStyles.titleTextWrap}>
            <Text style={fbStyles.title}>Ratings</Text>
            <Text style={fbStyles.subtitle}>
              Track service quality across completed trips
            </Text>
          </View>
        </View>
      </View>
      <View style={fbStyles.body}>
        <Feather name="clock" size={32} color={Theme.borderLight} />
        <Text style={fbStyles.message}>
          Feedback available once the trip is completed
        </Text>
        <Text style={fbStyles.sub}>
          Driver, supplier, and client ratings will appear here with audit-style
          entries when this voyage is closed.
        </Text>
      </View>
    </View>
  );
}

const fbStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  titleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  awardCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  body: {
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 440,
    lineHeight: 18,
  },
});

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.tabBtn,
        compact && styles.tabBtnCompact,
        active && styles.tabBtnActive,
        compact && active && styles.tabBtnActiveCompact,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {!compact ? (
        <FontAwesome
          name={icon}
          size={13}
          color={active ? "#2563eb" : "#6b7280"}
        />
      ) : null}
      <Text
        style={[
          styles.tabBtnText,
          compact && styles.tabBtnTextCompact,
          active && styles.tabBtnTextActive,
          compact && active && styles.tabBtnTextActiveCompact,
        ]}
      >
        {label}
      </Text>
      {compact && active ? <View style={styles.tabUnderlineCompact} /> : null}
    </TouchableOpacity>
  );
}

// ── Nav action button ──────────────────────────────────────────────────────────

function NavAction({
  icon,
  label,
  onPress,
  primary,
  danger,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress?: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.navActionBtn,
        primary && styles.navActionBtnPrimary,
        danger && styles.navActionBtnDanger,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <FontAwesome
        name={icon}
        size={12}
        color={primary ? "#fff" : danger ? "#ef4444" : "#94a3b8"}
      />
      <Text
        style={[
          styles.navActionText,
          primary && styles.navActionTextPrimary,
          danger && styles.navActionTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

void LedgerCard;
void ExpenseListCard;
void NavAction;

// ── Dashboard styles ────────────────────────────────────────────────────────────
const DS_BG = Theme.screenBackground;
const DS_CARD = Theme.surface;
const DS_BORDER = Theme.borderLight;
const DS_TEXT = Theme.textPrimaryDark;
const DS_MUTED = Theme.textSecondary;

const dStyles = StyleSheet.create({
  heroCard: {
    flexDirection: "row",
    backgroundColor: DS_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: DS_BORDER,
    padding: 20,
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  heroLeft: { flex: 1, minWidth: 260 },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  heroTripId: {
    fontSize: 28,
    fontWeight: "900",
    color: DS_TEXT,
    letterSpacing: -0.8,
    fontStyle: "italic",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Theme.surfaceGray,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  routeStop: { flex: 1, minWidth: 100 },
  routeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  routeCity: { fontSize: 18, fontWeight: "800", color: DS_TEXT },
  routeDate: { fontSize: 12, color: DS_MUTED, marginTop: 4 },
  routeDivider: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeLine: { height: 1, width: 32, backgroundColor: Theme.borderLight },
  heroStats: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DS_BORDER,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    alignSelf: "center",
    minWidth: 200,
  },
  statBox: { flex: 1, alignItems: "center" },
  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: DS_TEXT },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: DS_BORDER,
    marginHorizontal: 8,
  },
  statBoxSm: { alignItems: "flex-end" },
  statLabelSm: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  statValueSm: { fontSize: 14, fontWeight: "700", color: DS_TEXT },
  row: { flexDirection: "row", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  card: {
    backgroundColor: DS_CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: DS_BORDER,
    padding: 18,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  snapshotCard: { marginBottom: 16 },
  snapshotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  snapshotCell: {
    width: "32%",
    minWidth: 170,
    backgroundColor: "rgba(15,23,42,0.03)",
    borderWidth: 1,
    borderColor: DS_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  snapshotLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: DS_MUTED,
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  snapshotValue: {
    fontSize: 14,
    fontWeight: "700",
    color: DS_TEXT,
  },
  mapCol: { flex: 3, minWidth: 300 },
  auditCol: { flex: 2, minWidth: 260 },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DS_TEXT,
    flex: 1,
    letterSpacing: 0.3,
  },
  openMapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  openMapsBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  telemetryWrap: {
    borderRadius: 10,
    position: "relative",
    overflow: "hidden",
  },
  telemetryBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Theme.surfaceGray,
    borderTopWidth: 1,
    borderTopColor: DS_BORDER,
  },
  telemetryTitle: { fontSize: 12, fontWeight: "700", color: DS_TEXT },
  telemetrySub: { fontSize: 10, color: Theme.textMuted, marginTop: 1 },
  timelineHeaderIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: DS_BORDER,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  timelineHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.1,
  },
  auditScroll: { maxHeight: 360, paddingRight: 2 },
  auditItem: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.06)",
  },
  auditItemLast: { marginBottom: 0, paddingBottom: 0 },
  auditTrackCol: { width: 18, alignItems: "center", flexShrink: 0 },
  auditTimelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#059669",
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  auditTimelineDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#059669",
  },
  auditTimelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "rgba(5,150,105,0.28)",
    marginTop: 4,
    minHeight: 18,
  },
  auditContentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  auditBody: { flex: 1, minWidth: 0 },
  auditTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: DS_TEXT,
    marginBottom: 1,
  },
  auditDetail: { fontSize: 11, color: DS_MUTED },
  auditMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 1,
  },
  auditTime: {
    fontSize: 10,
    color: "rgba(15,23,42,0.42)",
    fontWeight: "600",
    minWidth: 56,
    textAlign: "right",
  },
  emptyText: {
    fontSize: 13,
    color: DS_MUTED,
    textAlign: "center",
    paddingVertical: 32,
  },
  bottomLeft: { flex: 2, minWidth: 220, gap: 12 },
  docsCol: { flex: 3, minWidth: 280 },
  cardMicroLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: DS_MUTED,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  driverAvatar: { width: 44, height: 44, borderRadius: 22 },
  cardHeaderRowInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reassignInlineBtn: {
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reassignInlineBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  driverAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  driverName: { fontSize: 15, fontWeight: "700", color: DS_TEXT },
  driverRating: { fontSize: 12, color: "#f59e0b", marginTop: 3 },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleName: { fontSize: 15, fontWeight: "700", color: DS_TEXT },
  vehicleSub: { fontSize: 12, color: DS_MUTED, marginTop: 3 },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.06)",
  },
  docIconWrap: { width: 22, alignItems: "center" },
  docLabel: { flex: 1, fontSize: 13, color: DS_TEXT, fontWeight: "500" },
  docStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  docStatusVerified: {
    backgroundColor: "rgba(34,197,94,0.1)",
    borderColor: "rgba(34,197,94,0.28)",
  },
  docStatusPending: {
    backgroundColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.28)",
  },
  docStatusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  docStatusTextVerified: { color: "#22c55e" },
  docStatusTextPending: { color: "#f59e0b" },
  docsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: DS_BORDER,
  },
  docsBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});

/** Manifest Pulse step icon — matches reference (green check | purple ring | gray dot). */
const manifestPulseStepStyles = StyleSheet.create({
  completed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#40B876",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  currentOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 5,
    borderColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  currentInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#5856D6",
    alignItems: "center",
    justifyContent: "center",
  },
  currentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  pendingOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#CBD5E1",
  },
});

function ManifestPulseStepIcon({
  phase,
}: {
  phase: "completed" | "current" | "pending";
}) {
  if (phase === "completed") {
    return (
      <View style={manifestPulseStepStyles.completed}>
        <Check size={14} color="#FFFFFF" strokeWidth={3.5} />
      </View>
    );
  }
  if (phase === "current") {
    return (
      <View style={manifestPulseStepStyles.currentOuter}>
        <View style={manifestPulseStepStyles.currentInner}>
          <View style={manifestPulseStepStyles.currentDot} />
        </View>
      </View>
    );
  }
  return (
    <View style={manifestPulseStepStyles.pendingOuter}>
      <View style={manifestPulseStepStyles.pendingInner} />
    </View>
  );
}

const neoStyles = StyleSheet.create({
  manifestNavLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 28,
    minWidth: 0,
  },
  manifestBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  manifestNavDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#f1f5f9",
  },
  manifestNavKicker: {
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 4,
    marginBottom: 5,
  },
  manifestNavTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  manifestNavTripId: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.9,
  },
  manifestStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  manifestStatusBadgeText: {
    color: "#047857",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontStyle: "italic",
  },
  manifestNavActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  auditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  auditBtnText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  manifestChatBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,120,87,0.08)",
    borderWidth: 1,
    borderColor: "rgba(4,120,87,0.22)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  manifestShareBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  shell: {
    width: "125%",
    alignSelf: "center",
    transform: [{ scale: 0.8 }],
    transformOrigin: "top center" as never,
  },
  grid: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    gap: 24,
  },
  sideCol: {
    width: 420,
    flexShrink: 0,
    position: "sticky" as never,
    top: 82,
    gap: 20,
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#0f172a",
    borderRadius: 42,
    padding: 34,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 40 },
    shadowOpacity: 0.28,
    shadowRadius: 54,
  },
  heroGlow: {
    position: "absolute",
    right: -90,
    top: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(79,70,229,0.08)",
  },
  heroBridge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingBottom: 18,
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  heroParty: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroPartyRight: {
    justifyContent: "flex-end",
  },
  heroPartyColEnd: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    maxWidth: "46%",
    minWidth: 0,
  },
  heroDriverAvatarStack: {
    position: "relative",
    width: MANIFEST_HERO_AVATAR_DESKTOP + 6,
    height: MANIFEST_HERO_AVATAR_DESKTOP + 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heroVehicleBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    borderWidth: 1.5,
    borderColor: "#0f172a",
    borderRadius: 999,
    backgroundColor: "#1e293b",
    overflow: "hidden",
  },
  heroPartyIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.1)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.18)",
  },
  heroPartyIconRose: {
    backgroundColor: "rgba(244,63,94,0.1)",
    borderColor: "rgba(244,63,94,0.18)",
  },
  heroPartyAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
  },
  heroPartyAvatarInitial: {
    position: "absolute",
    bottom: 2,
    right: 2,
    color: "#fff",
    fontSize: 6,
    fontWeight: "900",
  },
  heroPartyText: {
    flex: 1,
    minWidth: 0,
  },
  heroPartyTextRight: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  heroKicker: {
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: "#64748b",
    marginBottom: 4,
  },
  heroPartyName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: -0.25,
  },
  swapIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  alignRight: {
    textAlign: "right",
  },
  routeHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  routeHeroSide: {
    flex: 1,
    minWidth: 0,
  },
  routeHeroSideRight: {
    alignItems: "flex-end",
  },
  routeHeroCity: {
    color: "#fff",
    fontSize: 42,
    lineHeight: 45,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -2.2,
  },
  routeHeroSub: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  routeVector: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  routeVectorLine: {
    width: 22,
    height: 1,
    backgroundColor: "rgba(148,163,184,0.28)",
  },
  routeVectorTruck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  heroMetrics: {
    marginTop: 22,
    alignSelf: "center",
    width: "60%",
    minWidth: 560,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heroMetric: {
    flex: 1,
    alignItems: "center",
  },
  heroMetricDivider: {
    width: 1,
    height: 26,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroMetricLabel: {
    fontSize: 8,
    color: "#64748b",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  heroMetricValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
  },
  tabShell: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    gap: 8,
    padding: 8,
    borderRadius: 34,
    backgroundColor: "rgba(241,245,249,0.8)",
    borderWidth: 1,
    borderColor: "#fff",
  },
  neoTab: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
  },
  neoTabActive: {
    backgroundColor: "#0f172a",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  neoTabText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  neoTabTextActive: {
    color: "#fff",
  },
  journeyGrid: {
    flexDirection: "row",
    gap: 24,
    alignItems: "stretch",
  },
  journeyGridMobile: {
    gap: 12,
  },
  timelineCard: {
    flex: 1,
    minWidth: 340,
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderRadius: 32,
    borderWidth: 0,
    paddingVertical: 32,
    paddingHorizontal: 32,
    minHeight: 540,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 2,
    position: "relative",
    overflow: "hidden",
  },
  timelineCardMobile: {
    minWidth: 0,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    minHeight: 0,
  },
  timelineCardContent: {
    position: "relative",
    zIndex: 1,
  },
  timelineWatermarkWrap: {
    position: "absolute",
    right: -12,
    bottom: -8,
    width: 230,
    height: 180,
    opacity: 0.12,
    zIndex: 0,
  },
  timelineWatermarkWrapMobile: {
    right: -2,
    bottom: 8,
    width: 188,
    height: 146,
    opacity: 0.16,
  },
  timelineWatermark: {
    width: "100%",
    height: "100%",
  },
  cardTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 48,
  },
  cardTitleRowMobile: {
    marginBottom: 20,
  },
  manifestPulseTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  cardTitleDark: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  cardTitleDarkMobile: {
    fontSize: 16,
    letterSpacing: 0.25,
  },
  timelineItemWrap: {
    position: "relative",
  },
  timelineItemWrapSpaced: {
    marginBottom: 48,
  },
  timelineItemWrapSpacedMobile: {
    marginBottom: 26,
  },
  timelineConnector: {
    position: "absolute",
    left: 13,
    top: 32,
    width: 2,
    bottom: -8,
    borderRadius: 1,
    backgroundColor: "#EDF2F7",
  },
  manifestPulseIconColumn: {
    width: 28,
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 2,
    zIndex: 1,
  },
  timelineItem: {
    flexDirection: "row",
    gap: 24,
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderRadius: 16,
    marginBottom: 0,
  },
  timelineItemMobile: {
    gap: 12,
    paddingVertical: 2,
  },
  timelineItemActive: {
    backgroundColor: "#f8fafc",
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  timelineStatus: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  timelineStatusMobile: {
    fontSize: 11,
    letterSpacing: 1.1,
  },
  manifestPulseTitlePending: {
    color: "#94a3b8",
  },
  timelineTime: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
  },
  timelineTimeMobile: {
    fontSize: 11,
  },
  manifestPulseTimePending: {
    color: "#CBD5E1",
  },
  timelineLocation: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },
  timelineLocationMobile: {
    fontSize: 12,
  },
  timelineLocationCoords: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  timelineLocationCoordsMobile: {
    fontSize: 10,
  },
  manifestPulseSubtitlePending: {
    color: "#CBD5E1",
  },
  timelineDetails: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  simBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255, 251, 235, 0.55)",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  simActions: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  simBtnRevoke: {
    backgroundColor: "rgba(255, 251, 235, 0.45)",
  },
  simBtnMobile: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  simBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#f59e0b",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 1,
  },
  simBtnTextMobile: {
    fontSize: 10,
    letterSpacing: 1.2,
  },
  simLogBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  simLogBadgeMobile: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  simLogBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#f59e0b",
  },
  simLogBadgeTextMobile: {
    fontSize: 10,
  },
  simLogBadgeTime: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  simLogBadgeTimeMobile: {
    fontSize: 9,
  },
  simModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  simModal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  simModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  simModalTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  simModalAction: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 20,
    lineHeight: 26,
  },
  simModalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  simModalLocRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
  },
  simModalLocLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  simModalLocValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 18,
  },
  simModalLocCoords: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  simModalNoLoc: {
    fontSize: 12,
    color: "#64748b",
    fontStyle: "italic",
    marginBottom: 20,
    textAlign: "center",
  },
  simModalError: {
    fontSize: 12,
    color: "#f87171",
    marginBottom: 12,
    textAlign: "center",
  },
  simModalBtns: {
    flexDirection: "row",
    gap: 12,
  },
  simModalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  simModalCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#94a3b8",
  },
  simModalConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#f59e0b",
  },
  simModalConfirmText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },
  radarCard: {
    flex: 1.35,
    minWidth: 420,
    minHeight: 540,
    alignSelf: "stretch",
    borderRadius: 42,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.24,
    shadowRadius: 40,
  },
  radarMapLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
  },
  radarGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
    backgroundColor: "rgba(79,70,229,0.08)",
  },
  radarTopLeft: {
    position: "absolute",
    top: 24,
    left: 24,
    zIndex: 3,
    gap: 8,
  },
  radarControl: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  radarLive: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
  },
  radarLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  radarLiveText: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  radarHistory: {
    backgroundColor: "rgba(99,102,241,0.12)",
    borderColor: "rgba(99,102,241,0.25)",
  },
  radarHistoryText: {
    color: "#a5b4fc",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  radarRouteLine: {
    position: "absolute",
    left: "18%",
    bottom: "22%",
    width: "68%",
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.buttonPrimary,
    transform: [{ rotate: "-39deg" }],
    shadowColor: "#4D3636",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 14,
  },
  radarNode: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#fff",
  },
  radarNodeOrigin: {
    left: "16%",
    bottom: "18%",
    backgroundColor: Theme.buttonPrimary,
  },
  radarNodeDestination: {
    right: "17%",
    top: "18%",
    backgroundColor: "#ec4899",
  },
  radarTruck: {
    position: "absolute",
    left: "61%",
    top: "35%",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  radarPingBtn: {
    position: "absolute",
    bottom: 88,
    right: 14,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "rgba(96,165,250,0.12)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.28)",
  },
  radarPingBtnActive: {
    backgroundColor: "rgba(96,165,250,0.22)",
    borderColor: "rgba(96,165,250,0.5)",
  },
  radarPingBtnTimedOut: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.28)",
  },
  radarPingText: {
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  radarPingTextTimedOut: {
    color: "#f59e0b",
  },
  radarLiveTrackBtn: {
    position: "absolute",
    bottom: 130,
    right: 14,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "rgba(129,140,248,0.12)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.28)",
  },
  radarLiveTrackText: {
    color: "#818cf8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  radarBottom: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  radarBottomMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  radarBottomRight: {
    alignItems: "flex-end",
    flex: 0.85,
    minWidth: 0,
  },
  radarBottomLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  radarMetaCoords: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 14,
  },
  radarMetaTime: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  radarMetaLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  radarMetaValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
  },
  radarSpeed: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
  },
  radarSpeedUnit: {
    fontSize: 11,
    color: "rgba(255,255,255,0.42)",
    fontStyle: "normal",
    textTransform: "uppercase",
  },
  financeStack: {
    gap: 14,
  },
  /** Desktop finance summary: same manifest + adjustment stack as mobile, max width for readability. */
  financeManifestDesktopWrap: {
    width: "100%" as const,
    maxWidth: 1040,
    alignSelf: "center",
    gap: 0,
  },
  /** Full-width manifest column inside two-pane (no maxWidth cap). */
  financeManifestInPane: {
    width: "100%" as const,
    gap: 0,
  },
  financeManifestInPaneDesktop: {
    gap: 10,
  },
  financeSummaryTwoPane: {
    flexDirection: "row",
    gap: 18,
    alignItems: "flex-start",
    width: "100%" as const,
  },
  financeSummaryTwoPaneDesktop: {
    gap: 22,
    alignItems: "stretch",
  },
  financeSummaryPaneLeft: {
    flex: 1.28,
    minWidth: 0,
  },
  financeSummaryPaneLeftDesktop: {
    flex: 1.35,
  },
  financeSummaryPaneRight: {
    flex: 0.85,
    minWidth: 268,
    maxWidth: 400,
  },
  financeSummaryPaneRightDesktop: {
    flex: 0.72,
    minWidth: 300,
    maxWidth: 380,
    alignSelf: "stretch",
  },
  financeLedgerPreviewCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  financeLedgerPreviewCardDesktop: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  financeLedgerPreviewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  financeLedgerPreviewTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  financeLedgerPreviewTitleDesktop: {
    fontSize: 11,
    letterSpacing: 1.4,
  },
  financeLedgerPreviewLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  financeLedgerPreviewLinkText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4D3636",
  },
  financeLedgerPreviewSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 10,
    lineHeight: 15,
  },
  financeLedgerPreviewSubDesktop: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  financeLedgerPreviewScroll: {
    maxHeight: 420,
  },
  financeLedgerPreviewScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  financeLedgerPreviewEmpty: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    lineHeight: 18,
    paddingVertical: 12,
  },
  financePreviewTxnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  financePreviewTxnRowDesktop: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 12,
    borderRadius: 12,
  },
  financePreviewTxnIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  financePreviewTxnIconDesktop: {
    width: 36,
    height: 36,
    borderRadius: 11,
  },
  financePreviewTxnIconIn: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  financePreviewTxnIconOut: {
    backgroundColor: "#fff1f2",
  },
  financePreviewTxnMid: {
    flex: 1,
    minWidth: 0,
  },
  financePreviewTxnTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  financePreviewTxnTitleDesktop: {
    fontSize: 13,
    lineHeight: 17,
  },
  financePreviewTxnMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  financePreviewTxnMetaDesktop: {
    fontSize: 10,
    letterSpacing: 0.45,
    lineHeight: 13,
  },
  financePreviewTxnAmt: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    flexShrink: 0,
  },
  financePreviewTxnAmtDesktop: {
    fontSize: 14,
  },
  financePreviewTxnAmtIn: {
    color: Theme.primary,
  },
  financePreviewTxnAmtOut: {
    color: "#e11d48",
  },
  financeSummaryWorkspace: {
    flexDirection: "row",
    gap: 16,
    alignItems: "stretch",
  },
  /** Below desktop breakpoint: stack yield, then rail cards (sales → cost → voyage → summary). */
  financeSummaryWorkspaceStack: {
    flexDirection: "column",
  },
  financeSummaryMain: {
    flex: 1.25,
    minWidth: 0,
  },
  financeSummaryMainStack: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  financeSideRail: {
    flex: 1,
    minWidth: 300,
    gap: 10,
  },
  financeSideRailStack: {
    flexGrow: 0,
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  financeSubTabs: {
    flexDirection: "row",
    gap: 42,
    paddingHorizontal: 32,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  financeSubTab: {
    paddingBottom: 14,
  },
  financeSubTabText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2.5,
  },
  financeSubTabTextDesktop: {
    fontSize: 13,
    letterSpacing: 2,
  },
  financeSubTabTextActive: {
    color: "#171a20",
  },
  financeSubLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  yieldCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#fff",
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  yieldFormula: {
    width: "100%",
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  yieldFormulaItem: {
    minWidth: 84,
    alignItems: "center",
  },
  yieldFormulaLabel: {
    color: "#cbd5e1",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  yieldFormulaValue: {
    color: "#059669",
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
  },
  yieldFormulaCost: {
    color: "#e11d48",
  },
  yieldFormulaOperator: {
    color: "#cbd5e1",
    fontSize: 18,
    fontWeight: "900",
  },
  yieldOrb: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 120,
    height: 120,
    borderBottomLeftRadius: 120,
    backgroundColor: "rgba(79,70,229,0.05)",
  },
  yieldLabel: {
    color: "#cbd5e1",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 3,
    marginBottom: 8,
  },
  yieldValue: {
    color: "#0f172a",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  yieldSplit: {
    width: "100%",
    flexDirection: "row",
    gap: 20,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
  },
  yieldCol: {
    flex: 1,
    gap: 6,
  },
  yieldColRight: {
    alignItems: "flex-end",
  },
  yieldHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  redDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#f43f5e",
  },
  yieldColLabel: {
    flex: 1,
    color: "#94a3b8",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  yieldMiniBtn: {
    width: 20,
    height: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecfdf5",
  },
  yieldMiniBtnRed: {
    backgroundColor: "#fff1f2",
  },
  yieldSales: {
    color: "#059669",
    fontSize: 19,
    fontWeight: "900",
    fontStyle: "italic",
  },
  yieldCost: {
    color: "#e11d48",
    textAlign: "right",
  },
  financeRailCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#fff",
    padding: 16,
    justifyContent: "flex-start",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.045,
    shadowRadius: 16,
  },
  financeRailCardTap: {
    width: "100%",
  },
  financeRailHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  financeRailLabel: {
    flex: 1,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  financeRailValue: {
    color: "#059669",
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
  },
  financeRailCost: {
    color: "#e11d48",
  },
  financeRailExpenseValue: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
  },
  financeRailExpenseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#94a3b8",
  },
  financeRailMeta: {
    marginTop: 6,
    color: "#cbd5e1",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  financeRailBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 6,
    width: "100%",
  },
  financeRailBreakdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  financeRailBreakdownDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  financeRailBreakdownDotSale: {
    backgroundColor: "#10b981",
  },
  financeRailBreakdownDotCost: {
    backgroundColor: "#f43f5e",
  },
  financeRailBreakdownMid: {
    flex: 1,
    minWidth: 0,
  },
  financeRailBreakdownReason: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
  financeRailBreakdownMeta: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  financeRailBreakdownAmt: {
    fontSize: 10,
    fontWeight: "900",
    fontStyle: "italic",
    flexShrink: 0,
  },
  financeRailBreakdownAmtSale: {
    color: "#059669",
  },
  financeRailBreakdownAmtCost: {
    color: "#e11d48",
  },
  financeRailBreakdownStruck: {
    textDecorationLine: "line-through",
    opacity: 0.72,
  },
  financeRailBreakdownVoidNote: {
    marginTop: 6,
    color: "#64748b",
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    lineHeight: 12,
  },
  adjustmentSummaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e8ecf4",
    backgroundColor: "#fff",
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    marginBottom: 2,
  },
  adjustmentSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  adjustmentSummaryTitle: {
    flex: 1,
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  adjustmentSummaryBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${Theme.primary}14`,
  },
  adjustmentSummaryBadgeText: {
    color: Theme.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  adjustmentSummaryHint: {
    marginTop: 6,
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  adjustmentSummaryRows: {
    marginTop: 14,
    gap: 12,
  },
  adjustmentSummaryStat: {
    gap: 4,
  },
  adjustmentSummaryStatLabel: {
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  adjustmentSummaryStatValueSale: {
    color: "#059669",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  adjustmentSummaryStatValueCost: {
    color: "#e11d48",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  adjustmentSummaryStatMeta: {
    color: "#cbd5e1",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    lineHeight: 12,
  },
  adjustmentSummaryDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
  },
  adjustmentSummaryCtas: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  adjustmentSummaryCtaSale: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.08)",
    alignItems: "center",
  },
  adjustmentSummaryCtaCost: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.35)",
    backgroundColor: "rgba(15,118,110,0.08)",
    alignItems: "center",
  },
  adjustmentSummaryCtaText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#334155",
  },
  capturePaymentSlot: {
    marginTop: 12,
  },
  laneActionBtn: {
    width: "100%",
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignSelf: "stretch",
  },
  laneActionBtnMobile: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 5,
  },
  laneActionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  laneActionBtnDark: {
    backgroundColor: Theme.buttonDark,
    borderWidth: 0,
    borderColor: "transparent",
  },
  laneActionBtnText: {
    flexShrink: 1,
    color: Theme.buttonPrimaryText,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.15,
    textAlign: "center",
    lineHeight: 14,
  },
  laneActionBtnTextMobile: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.1,
  },
  laneActionBtnDarkText: {
    color: Theme.buttonDarkText,
  },
  laneActionHint: {
    color: Theme.textMuted,
    fontSize: 8,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 11,
  },
  capturePaymentDueFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    gap: 8,
  },
  capturePaymentDueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  capturePaymentDueLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  capturePaymentDueValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  capturePaymentDueValueDue: {
    color: Theme.primary,
  },
  capturePaymentDueValueSettled: {
    color: "#64748b",
    fontWeight: "700",
    fontSize: 12,
  },
  adjustmentLedgerCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#fff",
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.035,
    shadowRadius: 14,
  },
  adjustmentLedgerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  adjustmentLedgerTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.3,
  },
  adjustmentLedgerSub: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  adjustmentLedgerCount: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  adjustmentLedgerCountText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
  adjustmentLedgerEmpty: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
  },
  adjustmentLedgerRows: {
    gap: 8,
  },
  adjustmentLedgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  adjustmentLedgerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  adjustmentLedgerDotSale: {
    backgroundColor: "#10b981",
  },
  adjustmentLedgerDotCost: {
    backgroundColor: "#f43f5e",
  },
  adjustmentLedgerInfo: {
    flex: 1,
    minWidth: 0,
  },
  adjustmentLedgerReason: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
  },
  adjustmentLedgerMeta: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 7.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  adjustmentLedgerAmount: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
  },
  adjustmentLedgerAmountSale: {
    color: "#059669",
  },
  adjustmentLedgerAmountCost: {
    color: "#e11d48",
  },
  yieldDivider: {
    width: 1,
    backgroundColor: "#f8fafc",
  },
  expenseStrip: {
    width: "100%",
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseStripLabel: {
    color: "#94a3b8",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  expenseStripValue: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
  },
  provisionPanel: {
    backgroundColor: "#171a20",
    borderRadius: 24,
    padding: 18,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  provisionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.58)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  provisionModalCard: {
    width: "100%",
    maxWidth: 620,
  },
  provisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  provisionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    textTransform: "uppercase",
    letterSpacing: -1,
  },
  provisionSub: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  provisionClose: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  provisionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
  },
  provisionSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  provisionSummaryCard: {
    flexGrow: 1,
    flexBasis: "48%",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
  },
  provisionSummaryLabel: {
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  provisionSummaryValue: {
    color: "#34d399",
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
  },
  provisionSummaryValueCost: {
    color: "#fb7185",
  },
  provisionCnDnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  provisionCnDnBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  provisionCnDnBtnCredit: {
    borderColor: "rgba(99,102,241,0.45)",
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  provisionCnDnBtnDebit: {
    borderColor: "rgba(244,63,94,0.45)",
    backgroundColor: "rgba(244,63,94,0.12)",
  },
  provisionCnDnLabel: {
    color: "#e2e8f0",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  provisionChip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  provisionChipText: {
    color: "#fff",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  provisionForm: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  provisionFormHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  provisionFormTitle: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.2,
  },
  provisionFormMeta: {
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  provisionFormClose: {
    width: 24,
    height: 24,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  provisionInputLabel: {
    color: "#94a3b8",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginTop: 2,
  },
  provisionAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 11,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  provisionCurrency: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "800",
    marginRight: 7,
  },
  provisionAmountInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
    paddingVertical: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as never,
      default: {},
    }),
  },
  provisionReasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  provisionReasonChip: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  provisionReasonChipActive: {
    backgroundColor: "#eef2ff",
    borderColor: "#818cf8",
  },
  provisionReasonText: {
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  provisionReasonTextActive: {
    color: "#3730a3",
  },
  provisionOtherInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 7,
    ...Platform.select({
      web: { outlineStyle: "none" } as never,
      default: {},
    }),
  },
  provisionSaveBtn: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  provisionSaveBtnDisabled: {
    opacity: 0.45,
  },
  provisionSaveText: {
    color: "#fff",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  provisionAppliedList: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 12,
    gap: 8,
  },
  provisionAppliedTitle: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  provisionAppliedEmpty: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
  },
  provisionAppliedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  provisionAppliedInfo: {
    flex: 1,
    minWidth: 0,
  },
  provisionAppliedReason: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  provisionAppliedMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  provisionAppliedAmount: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
  },
  provisionAppliedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  provisionAppliedEdit: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  provisionAppliedRemove: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  provisionConfirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  provisionConfirmCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#0f172a",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
    zIndex: 2,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 24px 48px rgba(0,0,0,0.45)" } as Record<
          string,
          unknown
        >)
      : {}),
  },
  provisionConfirmTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  provisionConfirmBlock: {
    gap: 6,
    paddingVertical: 4,
  },
  provisionConfirmLine: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  provisionConfirmHint: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 15,
  },
  provisionVoidReasonLabel: {
    marginTop: 10,
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  provisionVoidReasonInput: {
    marginTop: 8,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  provisionConfirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  provisionConfirmCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  provisionConfirmCancelText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  provisionConfirmDanger: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center",
    backgroundColor: "rgba(244,63,94,0.22)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.45)",
  },
  provisionConfirmDangerDisabled: {
    opacity: 0.45,
  },
  provisionConfirmPrimary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center",
    backgroundColor: Theme.buttonPrimary,
  },
  provisionConfirmOkText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  txnList: {
    gap: 16,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 32,
  },
  txnRow: {
    backgroundColor: "#fff",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "#f8fafc",
    padding: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 26,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  txnIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  txnIconIn: {
    backgroundColor: "#ecfdf5",
  },
  txnIconOut: {
    backgroundColor: "#fff1f2",
  },
  txnInfo: {
    flex: 1,
    minWidth: 0,
  },
  txnTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  txnMeta: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 7,
  },
  txnAmount: {
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic",
  },
  txnAmountIn: {
    color: "#059669",
  },
  txnAmountOut: {
    color: "#e11d48",
  },
  vaultGrid: {
    backgroundColor: "rgba(248,250,252,0.8)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vaultCard: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "31.8%",
    minWidth: 0,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e6edf5",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  vaultTitle: {
    marginTop: 8,
    color: "#0f172a",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    textAlign: "center",
    letterSpacing: 0.8,
  },
  vaultSub: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  vaultBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  vaultBtnUpload: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  vaultBtnText: {
    color: Theme.buttonDarkText,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  vaultBtnTextUpload: {
    color: Theme.buttonPrimaryText,
  },
  sideCard: {
    backgroundColor: "#fff",
    borderRadius: 36,
    padding: 26,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.045,
    shadowRadius: 24,
  },
  feedbackSideCard: {
    paddingTop: 28,
  },
  sideSection: {
    gap: 18,
  },
  sideSectionBorder: {
    paddingTop: 28,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
  },
  sideHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  sideHeadingText: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2.6,
  },
  assetCardWrap: {
    marginBottom: 12,
  },
  assetCard: {
    borderRadius: 28,
    backgroundColor: "rgba(248,250,252,0.72)",
    borderWidth: 1,
    borderColor: "#f8fafc",
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assetLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  assetTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  assetIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  assetIconDark: {
    backgroundColor: "#171a20",
  },
  assetLabel: {
    color: "#cbd5e1",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 3,
  },
  assetValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  assetSubtle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },
  assetChangeBtn: {
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  assetChangeText: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  feedbackNode: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#fff",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#f8fafc",
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.035,
    shadowRadius: 16,
  },
  feedbackAvatar: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  feedbackAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    fontStyle: "italic",
  },
  feedbackInfo: {
    flex: 1,
    minWidth: 0,
  },
  feedbackRole: {
    color: "#cbd5e1",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  feedbackName: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  feedbackScore: {
    alignItems: "center",
    gap: 2,
  },
  feedbackScoreText: {
    color: "#171a20",
    fontSize: 20,
    fontWeight: "900",
    fontStyle: "italic",
  },
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  refHeroBridgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  refHeroBridgeCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: "46%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refHeroBridgeTextCol: {
    flex: 1,
    minWidth: 0,
  },
  refHeroBridgeTextColEnd: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  refHeroBridgeSwap: {
    flexShrink: 0,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  refHeroBridgeColRight: {
    justifyContent: "flex-end",
  },
  refHeroBridgeAvatarCol: {
    alignItems: "center",
    flexShrink: 0,
  },
  refHeroBridgeIconWrap: {
    width: MANIFEST_HERO_AVATAR_MOBILE + 4,
    height: MANIFEST_HERO_AVATAR_MOBILE + 4,
    alignItems: "center",
    justifyContent: "center",
  },
  refHeroBridgeIconWrapRose: {},
  refHeroBridgeLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  refHeroBridgeLabelRight: {
    textAlign: "right",
  },
  refHeroBridgeValue: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
    alignSelf: "stretch",
  },
  refHeroBridgeValueRight: {
    textAlign: "right",
  },
  refHeroRouteRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  refHeroRouteCol: {
    flex: 1,
    minWidth: 0,
  },
  refHeroRouteColJustify: {
    justifyContent: "center",
  },
  refHeroConnectorWrap: {
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    flexShrink: 0,
    paddingHorizontal: 2,
  },
  refHeroRouteColRight: {
    alignItems: "flex-end",
  },
  refHeroMetaShell: {
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refHeroMetaIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  refHeroMetaIconGhost: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  refHeroMetaDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  refHeroMetaItemRight: {
    justifyContent: "space-between",
  },
  refAssetRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    marginTop: 0,
    marginBottom: 10,
  },
  refAssetCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 10,
    gap: 3,
  },
  refAssetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    minHeight: 30,
  },
  refAssetIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff",
    flexShrink: 0,
  },
  refAssetIconWrapDark: {
    backgroundColor: "#0f172a",
  },
  refAssetChangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexShrink: 0,
  },
  refAssetChangeSpacer: {
    width: 52,
    height: 26,
    flexShrink: 0,
  },
  refAssetChangeBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  refAssetLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  refAssetValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 17,
  },
  refAssetSubtle: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 14,
  },
  refTabShell: {
    marginBottom: 8,
    padding: 3,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    gap: 3,
  },
  refTabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 32,
  },
  refTabBtnActive: {
    backgroundColor: Theme.buttonDark,
  },
  refTabBtnText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refTabBtnTextActive: {
    color: Theme.buttonDarkText,
  },
  refFinanceSubTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  refFinanceSubBtn: {
    paddingBottom: 6,
  },
  refFinanceSubBtnText: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
  },
  refFinanceSubBtnTextActive: {
    color: "#0f172a",
  },
  refFinanceSubLine: {
    marginTop: 3,
    height: 2,
    borderRadius: 999,
    backgroundColor: Theme.buttonPrimary,
  },
  refSettleMetaRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  refSettleMetaLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  refSettleMetaValuePositive: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "900",
    color: "#10b981",
  },
  refSettleMetaSep: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#eef2f7",
  },
  refSettleMetaRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  refSettleMetaValueNegative: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "900",
    color: "#f43f5e",
  },
  refFinanceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  refFinanceRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  refFinanceRowValuePositive: {
    color: "#10b981",
  },
  refFinanceRowValueNegative: {
    color: "#f43f5e",
  },
  refFinanceSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 24,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 8,
  },
  refFinanceSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 8,
  },
  refTxnRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6edf5",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  refTxnLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refTxnIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  refTxnIconIn: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  refTxnIconOut: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  refTxnTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  refTxnLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f172a",
  },
  refTxnMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  refTxnAmount: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  refTxnAmountIn: {
    color: Theme.primary,
  },
  refTxnAmountOut: {
    color: "#f43f5e",
  },
  refVaultWrap: {
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    padding: 14,
    gap: 12,
  },
  refVaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  refVaultHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  refVaultTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  refVaultSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refVaultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "stretch",
  },
  refVaultGridThreeCol: {
    flexWrap: "nowrap",
  },
  refVaultCard: {
    width: "48%",
    minWidth: 0,
    minHeight: 104,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e6edf5",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 7,
    justifyContent: "space-between",
    gap: 6,
  },
  refVaultCardThird: {
    width: undefined,
    flex: 1,
    minWidth: 0,
  },
  refVaultCardContent: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    gap: 4,
  },
  refVaultCardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e6edf5",
    flexShrink: 0,
  },
  refVaultCardIconCritical: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  refVaultCardIconOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#bbf7d0",
  },
  refVaultCardTitle: {
    width: "100%",
    fontSize: 8,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 11,
  },
  refVaultStatusChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  refVaultStatusPending: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  refVaultStatusCritical: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  refVaultStatusOk: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  refVaultCardStatus: {
    fontSize: 7,
    fontWeight: "500",
    color: "#64748b",
    lineHeight: 10,
  },
  refVaultViewBtn: {
    alignSelf: "stretch",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e6edf5",
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 26,
  },
  refVaultViewBtnPrimary: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  refVaultViewText: {
    fontSize: 7,
    fontWeight: "600",
    color: "#64748b",
  },
  refVaultViewTextPrimary: {
    color: "#4D3636",
  },
  refHeroCard: {
    marginBottom: 12,
    backgroundColor: "#030b1f",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: "hidden",
    borderBottomWidth: 3,
    borderBottomColor: Theme.driverEmerald,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  refModePillTopRight: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
  },
  refHeroBgGlow: {
    position: "absolute",
    left: -58,
    bottom: -58,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(16,185,129,0.14)",
  },
  refHeroKickerRow: { marginBottom: 14 },
  refHeroKicker: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 3.8,
    color: "#94a3b8",
  },
  refHeroCity: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  refHeroCityMobile: {
    fontSize: 22,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  // Slightly tighter than origin so long destination names wrap cleanly in the right column.
  refHeroCityMobileDest: {
    fontSize: 20,
    letterSpacing: -0.35,
    lineHeight: 22,
  },
  refHeroCityWebDest: {
    fontSize: 21,
    letterSpacing: -0.85,
    lineHeight: 24,
  },
  refHeroCityRight: {
    textAlign: "right",
    alignSelf: "stretch",
    width: "100%",
  },
  refHeroState: {
    marginTop: 2,
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  refHeroStateRight: {
    textAlign: "right",
    alignSelf: "stretch",
    width: "100%",
  },
  refHeroToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  refHeroToDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  refHeroToLine: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(16,185,129,0.5)",
  },
  refHeroToText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: Theme.positive,
  },
  refHeroDivider: {
    marginTop: 4,
    marginBottom: 12,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  refHeroMetaRow: {
    flexDirection: "row",
    gap: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  refHeroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  refHeroMetaLabel: {
    fontSize: 7,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#94a3b8",
  },
  refHeroMetaValue: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 1,
    letterSpacing: 0.2,
  },
  refHeroAssignedRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
  },
  refHeroPartyInfoRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
  },
  refHeroPartyInfoCell: {
    flex: 1,
    minWidth: 0,
  },
  refHeroPartyInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  refHeroAssignedLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 2.1,
  },
  refHeroAssignedValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  refModePill: {
    marginLeft: "auto",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  refModePillIntegrated: {
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: "rgba(16,185,129,0.45)",
  },
  refModePillManual: {
    backgroundColor: "rgba(148,163,184,0.12)",
    borderColor: "rgba(148,163,184,0.35)",
  },
  refModePillText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  refModePillTextIntegrated: {
    color: Theme.positive,
  },
  refModePillTextManual: {
    color: "#cbd5e1",
  },
  refHeroPartyRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  refHeroPartyCell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  refHeroPartyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  refHeroPartyLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2.1,
    color: "#94a3b8",
  },
  refHeroPartyBtn: {
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  refHeroPartyBtnText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Theme.buttonPrimaryText,
  },
  refHeroPartyValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.1,
  },
  refFeedbackWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  assignModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  assignModalCard: {
    maxHeight: "86%",
    width: "100%",
    maxWidth: 860,
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 14,
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 44,
  },
  assignModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  assignModalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  refTimelineHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  refTimelineHeaderIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  refManifestCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 16,
  },
  refKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  refKickerBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#2563eb",
  },
  refKickerText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: "#64748b",
  },
  refRouteRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  refRouteDots: { width: 10, alignItems: "center", marginTop: 5 },
  refDot: { width: 7, height: 7, borderRadius: 4 },
  refDotStart: { backgroundColor: "#10b981" },
  refDotEnd: { backgroundColor: "#ef4444" },
  refDotLine: {
    width: 1.5,
    flex: 1,
    minHeight: 16,
    marginVertical: 4,
    backgroundColor: "#e2e8f0",
  },
  refRouteTextCol: { flex: 1, gap: 8 },
  refRoutePlace: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  refMetaGrid: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  refMetaCell: { flex: 1, minWidth: 0 },
  refMetaLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refMetaValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  refOperatorCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
  },
  refOperatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refOperatorLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#94a3b8",
  },
  refOperatorValue: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  refOperatorSub: {
    marginTop: 9,
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  refAssignCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
    gap: 8,
  },
  refAssignTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  refAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
  },
  refAssignTxtWrap: { flex: 1, minWidth: 0 },
  refAssignLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
  },
  refAssignValue: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  refAssignFoot: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  refAssignFootText: { flex: 1, minWidth: 0, fontSize: 11, color: "#6b7280" },
  refOtpBtn: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refOtpBtnText: {
    color: Theme.buttonDarkText,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  refDocCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
  },
  refDocHeader: { marginBottom: 8 },
  refTimelineWrap: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
    gap: 8,
  },
  refTimelineTitle: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#0f172a",
  },
  refTimelineCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e6edf5",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  refTimelineItemWrap: {
    position: "relative",
    paddingLeft: 0,
  },
  refTimelineConnector: {
    position: "absolute",
    left: 13,
    top: 28,
    bottom: -6,
    width: 2,
    backgroundColor: "#e5e7eb",
  },
  refTimelineItem: { flexDirection: "row", gap: 10, paddingVertical: 9 },
  refTimelineItemExpanded: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 6,
  },
  refTimelineDotIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  refTimelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginTop: 5,
  },
  refTimelineBody: { flex: 1, minWidth: 0 },
  refTimelineTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  refTimelineTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  refTimelineStatus: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  refTimelineTime: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    flexShrink: 0,
  },
  refTimelineLocation: {
    marginTop: 2,
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600",
    lineHeight: 14,
  },
  refTimelineCoords: {
    marginTop: 2,
    fontSize: 9,
    color: "#94a3b8",
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  refTimelineDetails: {
    marginTop: 8,
    fontSize: 10,
    color: "#475569",
    lineHeight: 15,
    fontStyle: "italic",
  },
  refAssignInlineRow: {
    marginTop: 2,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 12,
    gap: 10,
    flexDirection: "row",
  },
  refAssignInlineCell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  refAssignInlineLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: "#94a3b8",
  },
  refAssignInlineValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  refAssignInlineBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refAssignInlineBtnText: {
    color: Theme.buttonDarkText,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  refDeliveredCard: {
    marginTop: 4,
    borderRadius: 20,
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refDeliveredLabel: {
    fontSize: 8,
    color: "#d1fae5",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refDeliveredValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "900",
    color: "#fff",
    fontStyle: "italic",
    letterSpacing: -0.2,
  },
  refDeliveredIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  refFinanceWrap: { gap: 8 },
  refManifestNetHuge: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: "#0f172a",
    textAlign: "center",
    alignSelf: "center",
  },
  refManifestHeroSplit: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    flexDirection: "row",
    gap: 10,
    width: "100%",
    alignItems: "flex-start",
  },
  /** Wider gap between sale/cost columns on desktop trip finance. */
  refManifestHeroSplitDesktop: {
    gap: 16,
    alignItems: "flex-start",
  },
  refManifestCol: { flex: 1, minWidth: 0 },
  refManifestHeroSep: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#eef2f7",
    marginHorizontal: 2,
    minHeight: 72,
  },
  refManifestColHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  refManifestColHeadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  refManifestColTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    flexShrink: 1,
  },
  refManifestDot: { width: 6, height: 6, borderRadius: 3 },
  refManifestDotSales: { backgroundColor: "#22c55e" },
  refManifestDotCost: { backgroundColor: "#fb7185" },
  refManifestMiniPlus: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  refManifestMiniPlusMuted: {},
  refManifestColAmount: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  refManifestSalesAmt: { color: "#16a34a" },
  refManifestCostAmt: {
    color: "#e11d48",
  },
  refManifestMicroBox: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eef2f7",
    backgroundColor: "#f8fafc",
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 3,
  },
  refManifestMicroLine: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  refManifestMicroRight: {
    alignSelf: "flex-end",
    textAlign: "right",
    width: "100%",
  },
  refManifestMicroAdjSales: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: "#16a34a",
    textTransform: "uppercase",
  },
  refManifestMicroAdjCost: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: "#e11d48",
    textTransform: "uppercase",
  },
  refProvisionWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    ...Platform.select({
      web: { boxShadow: "0 24px 50px rgba(15,23,42,0.1)" },
      default: {},
    }),
  },
  refProvisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  refProvisionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    letterSpacing: -0.3,
    textTransform: "uppercase",
    minWidth: 0,
  },
  refProvisionClose: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignSelf: "flex-start",
  },
  refProvisionDnRow: { flexDirection: "row", gap: 12 },
  refProvisionDnBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  refProvisionCnBtn: {
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  refProvisionDnBtnDebit: {
    borderColor: "rgba(244,63,94,0.35)",
    backgroundColor: "rgba(244,63,94,0.08)",
  },
  refProvisionDnLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  refProvisionChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  refProvisionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  refProvisionChipTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
  },
  refProvisionFullBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  refProvisionFullBtnTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  refInlineAdjustWrap: {
    marginTop: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: "0 12px 28px rgba(15,23,42,0.08)" },
      default: {},
    }),
  },
  refInlineAdjustHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  refInlineAdjustTitle: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    textTransform: "uppercase",
  },
  refInlineAdjustSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  refInlineModeBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refInlineModeBadgeCredit: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(22,163,74,0.35)",
  },
  refInlineModeBadgeDebit: {
    backgroundColor: "rgba(244,63,94,0.1)",
    borderColor: "rgba(225,29,72,0.28)",
  },
  refInlineModeBadgeTxt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1e293b",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  refInlineAdjustClose: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  refInlineAdjustLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  refInlineAdjustLockedMeta: {
    marginTop: -2,
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  refInlineAdjustRow: {
    flexDirection: "row",
    gap: 10,
  },
  refInlineAdjustBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  refInlineAdjustBtnActive: {
    borderColor: "#4D3636",
    backgroundColor: "rgba(79,70,229,0.2)",
  },
  refInlineAdjustImpactPlus: {
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.18)",
  },
  refInlineAdjustImpactMinus: {
    borderColor: "rgba(244,63,94,0.45)",
    backgroundColor: "rgba(244,63,94,0.18)",
  },
  refInlineAdjustBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#cbd5e1",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  refInlineAdjustBtnTextActive: {
    color: Theme.buttonPrimaryText,
  },
  refInlineAmountRow: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  refInlineCurrency: {
    fontSize: 28,
    fontWeight: "300",
    color: "#334155",
    marginRight: 10,
  },
  refInlineAmountInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: "300",
    color: "#0f172a",
    ...Platform.select({
      web: { outlineStyle: "none" } as never,
      default: {},
    }),
  },
  refInlineReasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  refInlineReasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  refInlineReasonChipActive: {
    borderColor: "#4D3636",
    backgroundColor: "rgba(79,70,229,0.12)",
  },
  refInlineReasonChipTxt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  refInlineReasonChipTxtActive: {
    color: "#3730a3",
  },
  refInlineOtherInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    ...Platform.select({
      web: { outlineStyle: "none" } as never,
      default: {},
    }),
  },
  refInlineSaveBtn: {
    marginTop: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  refInlineSaveBtnDisabled: {
    opacity: 0.45,
  },
  refInlineSaveBtnTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  refManifestSplitSection: { gap: 10 },
  refManifestSplitHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  refManifestSplitTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: "#cbd5e1",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  refManifestBands: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",
    gap: 14,
    ...Platform.select({
      web: { boxShadow: "0 18px 50px rgba(15,23,42,0.05)" },
      default: {},
    }),
  },
  refManifestBand: { gap: 8 },
  refManifestBandSep: { height: 1, backgroundColor: "#f1f5f9" },
  refManifestBandLblRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  refManifestBandLbl: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  refManifestBandLblIn: { color: "#15803d" },
  refManifestBandLblOut: { color: "#e11d48" },
  refManifestBandEmpty: {
    paddingVertical: 8,
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
    fontStyle: "italic",
  },
  refManifestBandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 10,
    borderWidth: 1,
  },
  refManifestBandRowIn: {
    borderColor: "rgba(34,197,94,0.12)",
    backgroundColor: "rgba(236,253,245,0.45)",
  },
  refManifestBandRowOut: {
    borderColor: "rgba(244,63,94,0.12)",
    backgroundColor: "rgba(254,242,242,0.45)",
  },
  refManifestBandRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  refManifestBandReason: {
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    color: "#1e293b",
  },
  refManifestBandAmtIn: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#15803d",
  },
  refManifestBandAmtOut: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#e11d48",
  },
  refSettleCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 16,
    alignItems: "center",
  },
  refSettleLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  refSettleValue: {
    marginTop: 6,
    fontSize: 40,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.8,
  },
  refSettleHint: {
    marginTop: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 14,
  },
  refCollectionsRow: {
    marginTop: 12,
    width: "100%",
    flexDirection: "row",
    gap: 8,
  },
  refCollectionsCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
    alignItems: "flex-start",
    minWidth: 0,
  },
  refCollectionsCardRight: {
    alignItems: "flex-end",
  },
  refCollectionsLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#64748b",
    textTransform: "uppercase",
  },
  refCollectionsValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  refCollectionsValueIn: {
    color: "#15803d",
  },
  refCollectionsValueOut: {
    color: "#b91c1c",
  },
  refCollectionsMeta: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  refSettleMicro: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
  },
  refSettleMicroRight: {
    textAlign: "right",
    alignSelf: "flex-end",
  },
  refSettleMetaLabelRightAligned: {
    textAlign: "right",
    alignSelf: "flex-end",
  },
  refSettleExpenseRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refSettleExpenseLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  refSettleExpenseVal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  mobileFinanceAdjCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    gap: 10,
  },
  mobileFinanceAdjHeader: {
    gap: 3,
    marginBottom: 4,
  },
  mobileFinanceAdjTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  mobileFinanceAdjSub: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.85,
  },
  mobileFinanceAdjRow: {
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#f8fafc",
  },
  mobileFinanceAdjMetric: {
    flex: 1,
    minWidth: 0,
  },
  mobileFinanceAdjMetricLbl: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.65,
    marginBottom: 3,
  },
  mobileFinanceAdjMetricVal: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  mobileFinanceAdjMetPos: { color: "#16a34a" },
  mobileFinanceAdjMetNeg: { color: "#dc2626" },
  mobileFinanceAdjBtn: {
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#0f172a",
  },
  mobileFinanceAdjBtnMuted: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
  },
  mobileFinanceAdjBtnCost: {
    backgroundColor: "#1e293b",
    borderColor: "#1e293b",
  },
  mobileFinanceAdjBtnTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  mobileFinanceAdjBtnTxtMuted: {
    color: "#334155",
  },
  mobileFinanceAdjGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  mobileFinanceAdjGhostTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  refSettleBadge: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refSettleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#059669",
  },
  refSettleHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  refSettleKicker: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  refSettleTitle: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    fontStyle: "italic",
  },
  refSettleSub: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  refSettleAmountRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  refSettleAmountWrap: {
    flex: 1,
    minWidth: 0,
  },
  refSettleAmountLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  refSettleAmountValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.8,
  },
  refSettlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  refSettlePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refSettleProgressTrack: {
    marginTop: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  refSettleProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0f172a",
  },
  refSettleMetricsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  refSettleMetricCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  refSettleMetricLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 3,
  },
  refSettleMetricValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  refSettleMetricValueStrong: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  refFinanceBreakCard: {
    backgroundColor: "#fff",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 16,
    gap: 10,
  },
  refAdjRegHeader: {
    marginBottom: 2,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  refAdjRegTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#64748b",
  },
  refFinanceEmpty: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 6,
  },
  refFinanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  refAdjLabelCol: { flex: 1, minWidth: 0 },
  refAdjPartyTag: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.65,
    color: "#94a3b8",
  },
  refAdjRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  refAdjTrash: { padding: 2 },
  refFinanceRowLabel: { fontSize: 12, color: "#475569", fontWeight: "700" },
  refFinanceRowValue: { fontSize: 13, color: "#0f172a", fontWeight: "800" },
  refFinanceRowValueStrong: { fontSize: 15 },
  refBottomInfo: {
    borderRadius: 22,
    backgroundColor: "#0f172a",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refBottomInfoLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#94a3b8",
  },
  refBottomInfoValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  refBottomInfoBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  root: {
    flex: 1,
    backgroundColor: DS_BG,
    overflow: "hidden",
  },

  // ── Top nav ──
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    flexWrap: "wrap",
    gap: 12,
  },
  navBarMobile: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    paddingTop: 8,
    paddingBottom: 8,
    flexWrap: "nowrap",
    alignItems: "center",
  },
  navCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  navChatCircle: {
    borderColor: "rgba(4,120,87,0.25)",
    backgroundColor: "rgba(4,120,87,0.06)",
  },
  navMobileRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navMobileCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  navMobileKicker: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  navMobileTripRow: {
    marginTop: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  navMobileTripId: {
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    letterSpacing: -0.25,
  },
  navMobilePulseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  navMobileDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  navMobileDotEmerald: {
    backgroundColor: "#34d399",
  },
  navMobileDotIndigo: {
    backgroundColor: Theme.buttonPrimary,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  navBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  navBackText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  navTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  navPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  navPillAsset: { backgroundColor: "#DBEAFE" },
  navPillAggregate: { backgroundColor: "#FEF3C7" },
  navPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.5,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  navActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  navActionBtnPrimary: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  navActionBtnDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
  },
  navActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  navActionTextPrimary: { color: "#fff" },
  navActionTextDanger: { color: "#ef4444" },

  // ── Tab bar ──
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabBarMobile: {
    marginHorizontal: 12,
    marginTop: 10,
    borderBottomWidth: 0,
    borderRadius: 14,
    backgroundColor: "rgba(226,232,240,0.55)",
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 4,
  },
  tabBarMobileInline: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: "rgba(226,232,240,0.55)",
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 4,
    flexDirection: "row",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginRight: 28,
    position: "relative",
  },
  tabBtnActive: {},
  tabBtnCompact: {
    flex: 1,
    marginRight: 0,
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tabBtnActiveCompact: {
    backgroundColor: Theme.buttonDark,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  tabBtnTextCompact: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tabBtnTextActive: {
    color: "#60a5fa",
  },
  tabBtnTextActiveCompact: {
    color: Theme.buttonDarkText,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#60a5fa",
    borderRadius: 1,
  },
  tabUnderlineCompact: {
    position: "absolute",
    bottom: 2,
    left: "32%",
    right: "32%",
    height: 2,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: {
    width: "100%",
    maxWidth: 1680,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 20,
  },
  scrollContentDesktop: {
    maxWidth: 1920,
    width: "100%",
  },

  // ── Tracking tab layout ──
  workspaceRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  workspaceLeftCol: {
    flex: 0.95,
    minWidth: 360,
    gap: 16,
  },
  workspaceRightCol: {
    flex: 1.05,
    minWidth: 420,
    gap: 16,
  },
  voyageCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
    gap: 16,
  },
  sectionKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionKickerBar: {
    width: 4,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#2563eb",
  },
  sectionKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  routeLineWrap: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  routeDotsCol: {
    width: 14,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fff",
  },
  routeDotStart: {
    backgroundColor: "#10b981",
  },
  routeDotEnd: {
    backgroundColor: "#ef4444",
  },
  routeDashedLine: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: "#cbd5e1",
    borderStyle: "dashed",
    marginVertical: 4,
  },
  routeTextCol: {
    flex: 1,
    justifyContent: "space-between",
    minHeight: 62,
  },
  routePlace: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  voyageMetaGrid: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
    flexDirection: "row",
    gap: 12,
  },
  voyageMetaCell: {
    flex: 1,
    minWidth: 0,
  },
  voyageMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  voyageMetaValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  operatorCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 8,
  },
  operatorBadge: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  operatorLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  operatorValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  operatorSub: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  telemetryWrap: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    position: "relative",
  },
  telemetryOverlay: {
    position: "absolute",
    bottom: 16,
    right: 16,
    left: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.4)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  telemetryTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  telemetrySub: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lrGrow: {
    flex: 1,
  },
  otpStateCardInline: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 4,
  },
  otpStateBodyRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  otpStateBodyLeft: {
    flex: 1,
    minWidth: 0,
  },
  otpStateBodyRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  otpActionStatus: {
    fontSize: 9,
    fontWeight: "600",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  otpStateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  otpStateTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  otpStateSub: {
    fontSize: 11,
    color: "#6b7280",
    lineHeight: 16,
  },
  otpCodeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  otpCodeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  otpCodeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.8,
  },
  otpResendBtn: {
    marginTop: 0,
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  otpResendBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  otpDisabledBtn: {
    marginTop: 0,
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#111827",
    opacity: 0.72,
  },
  otpDisabledBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  otpStateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  otpStateBadgePending: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  otpStateBadgeVerified: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  otpStateBadgeText: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  otpStateBadgeTextPending: {
    color: "#b45309",
  },
  otpStateBadgeTextVerified: {
    color: "#047857",
  },
  trackingRightCol: {
    flex: 1,
    minWidth: 0,
  },
  assignTimelineRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
    flex: 1,
  },
  truckCol: {
    width: "36%",
    flexShrink: 0,
    minWidth: 240,
  },
  timelineCol: {
    flex: 1,
    minWidth: 0,
  },
  feedbackWrap: {
    marginTop: 4,
  },

  // ── Location log ──
  locationLogWrap: {
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ede9fe",
    overflow: "hidden",
  },
  locationLogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  locationLogHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  locationLogTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3b0764",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  locationLogBadge: {
    backgroundColor: "#ede9fe",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  locationLogBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#7c3aed",
  },
  locationLogScroll: {
    maxHeight: 260,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  locationLogRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 7,
  },
  locationLogTrack: {
    alignItems: "center",
    width: 12,
    paddingTop: 3,
  },
  locationLogDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#7c3aed",
  },
  locationLogLine: {
    flex: 1,
    width: 1,
    backgroundColor: "#ddd6fe",
    marginTop: 3,
  },
  locationLogContent: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 4,
  },
  locationLogTime: {
    fontSize: 10,
    fontWeight: "600",
    color: "#7c3aed",
    marginBottom: 1,
  },
  locationLogName: {
    fontSize: 12,
    color: "#1e293b",
    fontWeight: "400",
    lineHeight: 17,
  },

  // ── Finance tab layout ──
  financeRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  financeContentRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  financeOverviewCol: {
    flex: 7,
    minWidth: 0,
  },
  financeSummaryCol: {
    flex: 3,
    minWidth: 0,
  },
  darkSection: {
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  darkSectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F1F5F9",
    textTransform: "uppercase",
  },
  detailBody: {
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailValue: { fontSize: 10, fontWeight: "600", color: "#111827" },
  detailValueRed: { color: "#ef4444" },
  detailValueBoldItalic: {
    fontSize: 10,
    fontWeight: "700",
    color: "#111827",
    fontStyle: "italic",
  },
  detailValueBold: { fontSize: 10, fontWeight: "700", color: "#111827" },
  detailValueGreen: { color: "#15803d" },
  twoColRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 10,
  },
  twoColItem: { flex: 1, minWidth: 0 },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryCardItem: { flex: 1, alignItems: "flex-start" },
  summaryCardLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryCardValue: { fontSize: 11, fontWeight: "700", color: "#0F172A" },
  summaryCardValueGreen: { color: "#22c55e" },
  summaryCardValueRed: { color: "#ef4444" },
  transactionHistoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  transactionHistoryHeader: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  transactionHistoryEmpty: {
    fontSize: 13,
    color: "#64748b",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  transactionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  transactionIconIn: {
    backgroundColor: "#16a34a",
  },
  transactionIconOut: {
    backgroundColor: "#dc2626",
  },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionText1: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  transactionText2: { fontSize: 11, color: "#64748B", marginTop: 2 },
  transactionAmount: { fontSize: 13, fontWeight: "700" },
  transactionAmountIn: { color: "#22c55e" },
  transactionAmountOut: { color: "#ef4444" },

  // ── Error ──
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorText: { fontSize: 15, color: "#6b7280" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.buttonDarkText,
  },

  // ── Finance two-col layout ──
  financeColsRow: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  financeLeftCol: {
    flex: 0.78,
    minWidth: 360,
    gap: 16,
  },
  financeRightCol: {
    flex: 1.22,
    minWidth: 460,
    flexDirection: "column",
    gap: 16,
  },
  financeAdjustmentsDesktopCtas: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  financeTxnDesktopList: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    padding: 12,
    gap: 8,
  },
  financeSummaryCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 18,
    gap: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  financeSummaryTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  financeSummarySub: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  financeSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  financeSummaryCell: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  financeSummaryLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 4,
  },
  financeSummaryValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  financeSummaryValuePositive: {
    color: Theme.positive,
  },
  financeSummaryValueNegative: {
    color: Theme.negative,
  },
  yieldCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 20,
    gap: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  yieldHeader: {
    gap: 4,
  },
  yieldTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    fontStyle: "italic",
  },
  yieldSub: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  yieldStatsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  yieldStatItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  yieldStatPositive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.borderLight,
  },
  yieldStatNegative: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderLight,
  },
  yieldStatAmount: {
    fontSize: 22,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
  },
  yieldStatLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  netResultCard: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    padding: 16,
    gap: 8,
  },
  netResultLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  netResultValue: {
    fontSize: 28,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: -0.8,
  },
  netResultTrend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  netResultTrendText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.positive,
  },
  financeAdjustmentsCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 18,
    gap: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  financeAdjustmentsHeader: {
    gap: 3,
    marginBottom: 4,
  },
  financeAdjustmentsTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  financeAdjustmentsSub: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  financeAdjustmentsRow: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: Theme.surfaceGray,
  },
  financeAdjustmentsMetric: {
    flex: 1,
    minWidth: 0,
  },
  financeAdjustmentsMetricLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.05,
    marginBottom: 3,
  },
  financeAdjustmentsMetricValue: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  financeAdjustmentsMetricValuePositive: {
    color: Theme.positive,
  },
  financeAdjustmentsMetricValueNegative: {
    color: Theme.negative,
  },
  financeAdjustmentsBtn: {
    borderRadius: 999,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  financeAdjustmentsBtnAlt: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  financeAdjustmentsBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  financeAdjustmentsBtnTextAlt: {
    color: Theme.textSecondary,
  },
  financeTxnCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  financeTxnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  financeTxnTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  financeTxnCount: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  financeTxnSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  financeTxnSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  financeTxnEmpty: {
    fontSize: 12,
    color: Theme.textMuted,
    paddingVertical: 10,
    textAlign: "center",
  },
  financeTxnList: {
    gap: 8,
  },
  financeTxnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  financeTxnLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  financeTxnIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  financeTxnIconIn: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.borderLight,
  },
  financeTxnIconOut: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderLight,
  },
  financeTxnTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  financeTxnLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  financeTxnMeta: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
  financeTxnAmount: {
    fontSize: 12,
    fontWeight: "800",
  },
  financeTxnAmountIn: {
    color: Theme.positive,
  },
  financeTxnAmountOut: {
    color: Theme.negative,
  },

  // ── Document preview modal (web) ──
  docModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  docModalCard: {
    width: "100%",
    maxWidth: 920,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  docModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 10,
  },
  docModalCloseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  docModalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  docModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  docModalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  docModalBody: {
    minHeight: 280,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  docModalCenter: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 24,
  },
  docModalImage: {
    width: "100%",
    height: 420,
    minHeight: 280,
    backgroundColor: "#f8fafc",
  },
  docModalHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  docGalleryWrap: {
    position: "relative",
    width: "100%",
  },
  docGallerySlide: {
    minHeight: 280,
    alignItems: "stretch",
    justifyContent: "center",
  },
  docGalleryNavBtn: {
    position: "absolute",
    top: "50%",
    width: 36,
    height: 36,
    marginTop: -18,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  docGalleryNavBtnLeft: {
    left: 8,
  },
  docGalleryNavBtnRight: {
    right: 8,
  },
  docGalleryNavBtnDisabled: {
    opacity: 0.35,
  },
  docGalleryDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  docGalleryDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  docGalleryDotActive: {
    width: 18,
    backgroundColor: Theme.buttonPrimary,
  },
  docGalleryDotInactive: {
    backgroundColor: "#e2e8f0",
  },
  docModalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    alignItems: "flex-end",
  },
  docModalFooterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0f172a",
  },
  docModalFooterBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
});

// ── Ledger card styles ────────────────────────────────────────────────────────

const ldStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  syncBadge: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  syncText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flexShrink: 1,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statGroup: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statLabelGreen: { color: Theme.positive },
  statLabelRed: { color: Theme.negative },
  statLabelOrange: { color: Theme.warning },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  statValueGreen: { color: Theme.positive },
  statValueRed: { color: Theme.negative },
  statValueOrange: { color: Theme.warning },
  statDivider: {
    width: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
    alignSelf: "stretch",
  },
  txSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  txSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  txHeader: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  txViewAll: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  txEmpty: { fontSize: 13, color: Theme.textSecondary, paddingVertical: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  txIconIn: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.borderLight,
  },
  txIconOut: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderLight,
  },
  txInfo: { flex: 1, minWidth: 0 },
  txTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  txMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  txAmount: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  txAmountIn: { color: Theme.positive },
  txAmountOut: { color: Theme.negative },
});

// ── Expense list card styles ───────────────────────────────────────────────────

const elStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  badge: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  total: {
    fontSize: 20,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  addBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: { fontSize: 13, color: Theme.textMuted, fontStyle: "italic" },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 8,
    gap: 12,
    backgroundColor: Theme.surfaceGray,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 3,
  },
  itemMeta: { fontSize: 10, color: Theme.textMuted, fontWeight: "500" },
  itemRight: { alignItems: "flex-end", gap: 4 },
  itemAmount: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  itemStatus: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  itemStatusText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
