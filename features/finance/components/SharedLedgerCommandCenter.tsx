/**
 * Command-center UI for Shared Ledger (replaces legacy table/card layout).
 * React Native layout inspired by the web reference: hero, tabs, chips, mission/txn grids,
 * trip-detail and transaction-forensic drill-downs.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudDownload,
  Inbox,
  LayoutGrid,
  Layers,
  Link2,
  List,
  Loader2,
  Phone,
  Tag,
  Target,
  Truck,
  X,
  Zap,
} from "lucide-react-native";
import { getTripAdjustments, type TripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
  isBlankOrPlaceholderPartyName,
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
} from "@/lib/partyAvatarDisplay";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SHARED_LEDGER_AWAITING_PARTNER_UPDATE,
  SHARED_LEDGER_PARTNER_PENDING_LABEL,
  type ReconciledRow,
  type SharedTxnLineKind,
} from "./sharedLedgerTypes";

export type CommandTxnRow = {
  id: string;
  status: "matched" | "no_entry" | "pending" | "conflict";
  tripRef: string;
  date: string;
  amountAbs: number;
  partnerAmount?: number;
  localAmount?: number;
  /** e.g. "12 Apr" for forensic + trip bridge cards */
  displayDate?: string;
  myRef?: string;
  partnerRef?: string;
  myMode?: string;
  partnerMode?: string;
  /** Raw signed amount from partner shared-ledger entry (direction). */
  partnerSignedAmount?: number;
  /** Our `trips.id` UUID for this row (when resolved). */
  tripDbId?: string;
  /**
   * True when this org already has a `trips` row for `tripRef`.
   * False = partner-only (“ghost”) trip id — merge may create the trip first.
   */
  hasLocalTrip?: boolean;
  /** When set, this payment line is tagged as charge / deduction / adjustment in the ledger. */
  lineKind?: SharedTxnLineKind | null;
};

export type StatusFilterKey =
  | "all"
  | "matched"
  | "no_entry"
  | "pending"
  | "conflict";

type MainTab = "Trips" | "Cash Flow" | "Shared";
type ViewLayout = "grid" | "table";

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

/**
 * Typography parity with `TripsHubTripCard` (`features/trips/components/TripsHubViews.tsx`)
 * so shared-ledger trip cards read as the same family as the main Trips hub.
 */
const SLG_FS_CAPTION = 8;
const SLG_FS_LABEL = 9;
const SLG_FS_BODY = 10;
const SLG_FS_AMOUNT = 12;
const SLG_FS_AMOUNT_LABEL = 7;
const SLG_FS_ROUTE_HERO = 11;

/** Gaps between my / bridge / partner in sale-value mirror (must match `mirrorColumnsRow` gap). */
const SLG_MIRROR_GAP = 6;
/** Bridge column width — must match `styles.bridge.width`; `bridgeTrackSpacer` uses gap + bridge + gap. */
const SLG_BRIDGE_WIDTH = 34;
const SLG_MIRROR_BRIDGE_TRACK = SLG_MIRROR_GAP + SLG_BRIDGE_WIDTH + SLG_MIRROR_GAP;
/** Watermark icon size (trip truck / payment link); scales slightly in animation. */
const SLG_WATERMARK_ICON_SIZE = 118;

/** Soft pulse on hub icons (shared ledger trip cards). */
function SlgIconPulse({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.72, {
          duration: 1050,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: 1050,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={pulseStyle}>{children}</Animated.View>;
}

/** Large background truck / link icon with gentle breathe + drift (trip vs payment cards). */
function SlgCardWatermark({ kind }: { kind: "trip" | "payment" }) {
  const breathe = useSharedValue(0.07);
  const drift = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(0.14, {
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.055, {
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, [breathe]);
  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 4800,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: 4800,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, [drift]);
  const wmStyle = useAnimatedStyle(() => ({
    opacity: breathe.value,
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, 10]) },
      { translateY: interpolate(drift.value, [0, 1], [0, -8]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.05]) },
    ],
  }));
  const color = Theme.textPrimaryDark;
  const size = SLG_WATERMARK_ICON_SIZE;
  const stroke = 1.35;
  return (
    <View style={styles.missionCardWatermarkShell} pointerEvents="none">
      <Animated.View style={[styles.missionCardWatermarkInner, wmStyle]}>
        {kind === "trip" ? (
          <Truck size={size} color={color} strokeWidth={stroke} />
        ) : (
          <Link2 size={size} color={color} strokeWidth={stroke} />
        )}
      </Animated.View>
    </View>
  );
}

function norm(s: string | null | undefined): string {
  return s == null ? "" : String(s).trim().toLowerCase();
}

/** Rupees on your side of a payment row (never mirrors partner for missing locals). */
function localColumnRupees(txn: CommandTxnRow): number {
  if (txn.localAmount != null) return txn.localAmount;
  if (txn.status === "no_entry") return 0;
  return txn.amountAbs;
}

/**
 * Partner-side rupees, or null when they have not shared this line (`pending` local-only rows).
 */
function partnerColumnRupees(txn: CommandTxnRow): number | null {
  if (txn.status === "pending") return null;
  return txn.partnerAmount ?? txn.amountAbs;
}

/** Green check only when both sides are linked and amounts match. */
function paymentBridgeCheckAligned(txn: CommandTxnRow): boolean {
  if (txn.status === "matched") return true;
  if (txn.status === "conflict") {
    const p = partnerColumnRupees(txn);
    if (p == null) return false;
    return Math.abs(localColumnRupees(txn) - p) < 0.5;
  }
  return false;
}

function normLedgerToken(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s || s === "—") return "";
  return s.toLowerCase();
}

function displayLedgerToken(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s || s === "—") return "—";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return `${s.slice(0, 8)}…${s.slice(-4)}`;
  }
  return s.length > 28 ? `${s.slice(0, 14)}…` : s;
}

/** Short label for payment rows in hub / trip tables. */
function shortTxnId(id: string): string {
  const s = (id ?? "").trim();
  if (!s) return "—";
  if (s.length <= 16) return s.toUpperCase();
  return `${s.slice(0, 8).toUpperCase()}…`;
}

/** Ledger-style id for trip payment table (matches “L:…” reference). */
function txnLedgerLineId(txn: CommandTxnRow): string {
  const raw = (txn.id ?? "").trim();
  const withoutLocalPrefix = /^l:/i.test(raw) ? raw.slice(2) : raw;
  return `L:${shortTxnId(withoutLocalPrefix)}`;
}

/** Optional ref line under txn id in trip table. */
function txnRefSnippetForRow(txn: CommandTxnRow): string | null {
  const raw = (txn.myRef ?? txn.partnerRef ?? "").trim();
  if (!raw) return null;
  const d = displayLedgerToken(raw);
  return d === "—" ? null : d;
}

function formatTripCardDate(iso: string | undefined): string {
  if (!iso || iso === "—") return "";
  const raw = iso.slice(0, 10);
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return raw;
}

/** One-line grey helper under the trip id on hub cards. */
function missionCardSummaryLine(r: ReconciledRow): string {
  const bits: string[] = [];
  const d = formatTripCardDate(r.internal?.date);
  if (d) bits.push(d);
  if (r.issue?.trim()) bits.push(r.issue.trim());
  if (bits.length > 0) return bits.join(" · ");
  if (r.status === "VERIFIED") return "Trip amounts match";
  if (r.status === "PENDING") return "Waiting on partner trip data";
  if (r.status === "MISMATCH") return "Trip charge differs from partner";
  return "Only on partner's books";
}

function filterChipDotColor(
  key: Exclude<StatusFilterKey, "all">,
): string {
  switch (key) {
    case "matched":
      return Theme.darkGreen;
    case "no_entry":
      return Theme.textMuted;
    case "pending":
      return Theme.textSecondary;
    case "conflict":
      return Theme.teslaRed;
  }
}

/** Short status labels for payment rows (plain language). */
function txnPillLabel(s: CommandTxnRow["status"]): string {
  if (s === "matched") return "Same";
  if (s === "no_entry") return "Add to yours";
  if (s === "pending") return SHARED_LEDGER_PARTNER_PENDING_LABEL;
  return "Different";
}

function lineKindShortLabel(kind: SharedTxnLineKind): string {
  if (kind === "deduction") return "Deduction";
  if (kind === "charge") return "Add-on charge";
  return "Adjustment";
}

function txnBadgeVariant(txn: CommandTxnRow) {
  switch (txn.status) {
    case "matched":
      return styles.badgeGreen;
    case "pending":
      return styles.badgeNeutral;
    case "conflict":
      return styles.badgeRed;
    case "no_entry":
    default:
      return styles.badgeGray;
  }
}

/** Partner row: public HTTP(S) avatar URL, or null → initials (cash tab style). */
function SlgPartnerAvatar({
  partyName,
  profileImageUrl,
  size,
}: {
  partyName: string;
  profileImageUrl: string | null | undefined;
  size: number;
}) {
  const uri = (profileImageUrl ?? "").trim();
  const hasHttp = uri.startsWith("http://") || uri.startsWith("https://");
  const r = size / 2;
  const initialsFont = Math.max(10, Math.round(size * 0.32));
  if (hasHttp) {
    return (
      <View
        style={[
          styles.slgPartyAvatarBorder,
          { width: size, height: size, borderRadius: r },
        ]}
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: r }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  if (isBlankOrPlaceholderPartyName(partyName)) {
    return null;
  }
  const initials = partyInitialsFromName(partyName);
  const bg = partyAvatarBackgroundColor((partyName || "—").trim() || "—");
  return (
    <View
      style={[
        styles.slgPartyAvatarBorder,
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${partyName} avatar`}
    >
      <Text
        style={[
          styles.slgPartyAvatarInitialsTxt,
          {
            fontSize: initialsFont,
            color: partyAvatarInitialsTextColor(bg),
          },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

export interface SharedLedgerCommandCenterProps {
  entityName: string;
  /** Resolved public avatar URL for the partner (client/supplier); initials when null. */
  partnerProfileImageUrl?: string | null;
  entityType: "CLIENT" | "SUPPLIER";
  embeddedInOverlay: boolean;
  myBookLabel: string;
  partnerLabel: string;
  viewMode: "trip" | "txn";
  setViewMode: (m: "trip" | "txn") => void;
  tripCounts: {
    all: number;
    matched: number;
    no_entry: number;
    pending: number;
    conflict: number;
  };
  txnCounts: {
    all: number;
    matched: number;
    no_entry: number;
    pending: number;
    conflict: number;
  };
  statusFilter: StatusFilterKey;
  setStatusFilter: (s: StatusFilterKey) => void;
  filteredRows: ReconciledRow[];
  filteredTxnRows: CommandTxnRow[];
  txnRowsAll: CommandTxnRow[];
  reconciledRows: ReconciledRow[];
  onUpdateMyBook: (row: ReconciledRow) => void;
  onRaiseDispute: (row: ReconciledRow) => void;
  actionLoading: boolean;
  /** Merge partner row: may create missing trip, then adds local payment entry. */
  onMergePartnerTransaction?: (
    txn: CommandTxnRow,
  ) => Promise<{ createdTrip: boolean; tripId: string }>;
  /** Human trip label (e.g. TRP-103) for a normalized trip ref. */
  missionLabelForTripRef?: (tripRef: string) => string;
  /** Optional route line for context. */
  tripRouteForTripRef?: (tripRef: string) => string | null;
  /** Full-page hub: opens shared-ledger PDF/Excel flow (embedded overlay uses parent header). */
  onPressDownload?: () => void;
}

/** Tighter type and cards on large browser windows — closer to other Finance screens. */
const webDesktopStyles = StyleSheet.create({
  /** Full-width like other finance pages — avoid oversized side margins. */
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 48,
    paddingTop: 4,
    width: "100%",
    alignSelf: "stretch",
  },
  heroEntityTitle: { fontSize: 16, letterSpacing: 0.2 },
  heroEntitySub: { fontSize: 9, letterSpacing: 1 },
  mainTab: { paddingVertical: 9 },
  mainTabTxt: { fontSize: 11 },
  pendingInboxTitle: {
    fontSize: 8,
    letterSpacing: 0.45,
  },
  pendingCard: {
    borderRadius: 7,
    padding: 6,
  },
  pendingHeroAmount: {
    fontSize: 15,
    lineHeight: 18,
  },
  pendingActionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  compareToggle: {
    borderRadius: 14,
    padding: 3,
  },
  compareBtn: {
    paddingVertical: 9,
    borderRadius: 12,
  },
  compareBtnTxt: {
    fontSize: 10,
  },
  gridTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  missionCard: {
    borderRadius: 32,
    marginBottom: 10,
  },
  missionCardGrid: {
    marginBottom: 0,
    width: "100%",
  },
  /** Outer block for trip “sale value” mirror (caption + pills). */
  tripGridMirrorBlock: {
    marginTop: 8,
    marginHorizontal: 12,
  },
  tripGridMirrorInner: {
    minHeight: 0,
  },
  mirrorSaleCaptionDesktop: {
    fontSize: 8,
    marginBottom: 4,
  },
  tripGridPaid: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  missionHead: {
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  missionId: {
    fontSize: SLG_FS_AMOUNT,
  },
  subTitle: { fontSize: 14 },
  subSub: { fontSize: 9 },
  detailHero: { borderRadius: 16, padding: 14 },
  bridgeTitle: { fontSize: 12 },
  txnBridgeCard: { borderRadius: 14 },
  subTitleForensic: { fontSize: 14 },
  subScrollForensic: { paddingHorizontal: 20 },
  mergeHeroAmt: { fontSize: 32 },
  auditTableCard: {
    borderRadius: 20,
    marginBottom: 12,
    width: "100%",
    alignSelf: "stretch",
  },
});

export function SharedLedgerCommandCenter({
  entityName,
  partnerProfileImageUrl = null,
  entityType,
  embeddedInOverlay,
  myBookLabel,
  partnerLabel,
  viewMode,
  setViewMode,
  tripCounts,
  txnCounts,
  statusFilter,
  setStatusFilter,
  filteredRows,
  filteredTxnRows,
  txnRowsAll,
  reconciledRows,
  onUpdateMyBook,
  onRaiseDispute,
  actionLoading,
  onMergePartnerTransaction,
  missionLabelForTripRef,
  tripRouteForTripRef,
  onPressDownload,
}: SharedLedgerCommandCenterProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /** Large browser window: tighter type and cards to match other finance pages. */
  const isWebDesktop =
    Platform.OS === "web" && windowWidth >= 1024;
  /** Stack pending inbox cards on phones / narrow web. */
  const pendingCardsFullWidth = windowWidth < 560;
  /**
   * Trip + payment hub cards: column count by width so “Sale value” mirror row stays readable.
   * Web ≥1024 keeps three-up desktop cells; native / narrow web steps 1 → 2 → 3 columns.
   */
  const tripHubGridCellStyle = useMemo(() => {
    if (Platform.OS === "web" && windowWidth >= 1024) {
      return styles.tripGridCell;
    }
    if (windowWidth < 520) {
      return styles.tripGridCellFull;
    }
    if (windowWidth < 820) {
      return styles.tripGridCellHalf;
    }
    return styles.tripGridCellThird;
  }, [windowWidth]);
  /**
   * Trips fleet table: width tracks viewport so flex columns absorb space (no dead strip after Sync).
   * Below min width, horizontal scroll applies.
   */
  const tripFleetTableLayout = useMemo(() => {
    const moneyCol = 100;
    const metaTxnCol = 56;
    const metaLastCol = 84;
    const syncCol = 52;
    const fixedCols = moneyCol * 3 + metaTxnCol + metaLastCol + syncCol;
    const flexMinMission = 156;
    const flexMinRoute = 204;
    const flexMinPartner = 196;
    const minTable = fixedCols + flexMinMission + flexMinRoute + flexMinPartner;
    const bleed = embeddedInOverlay ? 52 : 36;
    const tableWidth = Math.max(minTable, Math.floor(windowWidth - bleed));
    return { tableWidth, minTable };
  }, [windowWidth, embeddedInOverlay]);
  /** Top chrome: entity header + tabs when embedded in client/supplier detail (web). */
  const webDetailMinHeight = useMemo(() => {
    if (Platform.OS !== "web") return 0;
    const topChrome = embeddedInOverlay ? 200 : 140;
    return Math.max(560, windowHeight - topChrome);
  }, [embeddedInOverlay, windowHeight]);
  /**
   * Trip / txn drill-downs use absolute fill on native. On web, when this component sits inside a
   * parent ScrollView (e.g. client detail), absolute children get 0 height — use minHeight + relative.
   */
  const detailShellLayoutStyle = useMemo(() => {
    if (Platform.OS !== "web") {
      return StyleSheet.absoluteFillObject;
    }
    return {
      position: "relative" as const,
      width: "100%" as const,
      alignSelf: "stretch" as const,
      minHeight: webDetailMinHeight,
      flex: 1,
      flexDirection: "column" as const,
    };
  }, [webDetailMinHeight]);
  const rootWebDetailStyle =
    Platform.OS === "web"
      ? {
          minHeight: webDetailMinHeight,
          width: "100%" as const,
          alignSelf: "stretch" as const,
        }
      : null;
  /** Trips / Cash Flow / Shared — under the overview when not embedded (embedded screens use parent tabs). */
  const [mainTab, setMainTab] = useState<MainTab>("Shared");
  const [viewLayout, setViewLayout] = useState<ViewLayout>("grid");
  const [screen, setScreen] = useState<"hub" | "trip" | "txn">("hub");
  const [tripFocus, setTripFocus] = useState<ReconciledRow | null>(null);
  const [txnFocus, setTxnFocus] = useState<CommandTxnRow | null>(null);
  const [mergePreview, setMergePreview] = useState<CommandTxnRow | null>(null);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  /** Trip adjustment registry (AsyncStorage) — explains gaps vs payment lines. */
  const [tripAdjustments, setTripAdjustments] = useState<TripAdjustment[]>([]);

  useEffect(() => {
    let cancelled = false;
    const id = tripFocus?.tripId?.trim();
    if (!id) {
      setTripAdjustments([]);
      return;
    }
    void getTripAdjustments(id).then((list) => {
      if (!cancelled) setTripAdjustments(Array.isArray(list) ? list : []);
    });
    return () => {
      cancelled = true;
    };
  }, [tripFocus?.tripId]);

  const activeCounts =
    viewMode === "trip" ? tripCounts : txnCounts;

  const tripTxns = useMemo(() => {
    if (!tripFocus) return [];
    const key = norm(tripFocus.tripId);
    return txnRowsAll.filter((t) => norm(t.tripRef) === key);
  }, [tripFocus, txnRowsAll]);
  const pendingSyncTxns = useMemo(
    () => txnRowsAll.filter((t) => t.status === "no_entry").slice(0, 4),
    [txnRowsAll],
  );
  const tripTxnMetaByRef = useMemo(() => {
    const map = new Map<string, { count: number; last: string | null }>();
    for (const txn of txnRowsAll) {
      const key = norm(txn.tripRef);
      if (!key) continue;
      const prev = map.get(key) ?? { count: 0, last: null };
      const candidate = (txn.displayDate ?? txn.date ?? "").trim() || null;
      const nextLast =
        !prev.last || (candidate && candidate > prev.last) ? candidate : prev.last;
      map.set(key, { count: prev.count + 1, last: nextLast });
    }
    return map;
  }, [txnRowsAll]);

  const findTripByRef = useCallback(
    (ref: string) => {
      const k = norm(ref);
      return reconciledRows.find((r) => norm(r.tripId) === k);
    },
    [reconciledRows],
  );

  const tripStatusLabel = (r: ReconciledRow) => {
    if (r.status === "VERIFIED") return "Same";
    if (r.status === "PENDING") return SHARED_LEDGER_PARTNER_PENDING_LABEL;
    if (r.status === "MISMATCH") return "Different";
    return "New";
  };

  const tripBadgeVariant = (r: ReconciledRow) => {
    if (r.status === "VERIFIED") return styles.badgeGreen;
    if (r.status === "PENDING") return styles.badgeNeutral;
    if (r.status === "MISMATCH") return styles.badgeRed;
    return styles.badgeGray;
  };

  /** Reference: top strip — rose (variance), amber (awaiting), emerald (aligned). */
  const hubTripAccentStyle = (r: ReconciledRow) => {
    if (r.status === "MISMATCH") return styles.hubCardAccentRose;
    if (r.status === "PENDING") return styles.hubCardAccentWarn;
    if (r.status === "VERIFIED") return styles.hubCardAccentGood;
    return styles.hubCardAccentSlate;
  };

  const hubTxnAccentStyle = (txn: CommandTxnRow) => {
    if (txn.status === "conflict") return styles.hubCardAccentRose;
    if (txn.status === "pending") return styles.hubCardAccentWarn;
    if (txn.status === "matched") return styles.hubCardAccentGood;
    return styles.hubCardAccentSlate;
  };

  const openTripDetail = (row: ReconciledRow) => {
    setTripFocus(row);
    setScreen("trip");
  };

  const openTxnForensic = (txn: CommandTxnRow) => {
    setTxnFocus(txn);
    setScreen("txn");
  };

  const backFromSub = () => {
    setScreen("hub");
    setTripFocus(null);
    setTxnFocus(null);
  };

  const handleUsePartnerFromTxn = () => {
    if (!txnFocus) return;
    const trip = findTripByRef(txnFocus.tripRef);
    if (!trip) {
      Alert.alert(
        "Can’t report yet",
        "We couldn’t link this payment to a trip.",
      );
      return;
    }
    // "Sync to partner" from forensic view should open the same dispute flow/page
    // as the primary Raise Dispute action.
    onRaiseDispute(trip);
    backFromSub();
  };

  const handleDisputeFromTxn = () => {
    if (!txnFocus) return;
    const trip = findTripByRef(txnFocus.tripRef);
    if (!trip) {
      Alert.alert("Can’t report yet", "We couldn’t link this payment to a trip.");
      return;
    }
    onRaiseDispute(trip);
    backFromSub();
  };
  const handleAddPendingSync = (txn: CommandTxnRow) => {
    if (txn.status === "no_entry" && onMergePartnerTransaction) {
      setMergePreview(txn);
      return;
    }
    openTxnForensic(txn);
  };

  const confirmMergePartner = async () => {
    if (!mergePreview || !onMergePartnerTransaction) return;
    setMergeSubmitting(true);
    try {
      const result = await onMergePartnerTransaction(mergePreview);
      const actionNoun = entityType === "CLIENT" ? "received" : "paid";
      const createdTrip = !!result?.createdTrip;
      Alert.alert(
        "Book updated",
        createdTrip
          ? `Created trip in your book, then added ${actionNoun} payment.`
          : `Added ${actionNoun} payment to your existing trip.`,
      );
      setMergePreview(null);
    } catch {
      Alert.alert("Couldn’t add", "Please check your connection and try again.");
    } finally {
      setMergeSubmitting(false);
    }
  };

  const hubFilters: Array<{
    key: StatusFilterKey;
    label: string;
    dot: "matched" | "no_entry" | "pending" | "conflict" | "neutral";
  }> = [
    { key: "all", label: "All", dot: "neutral" },
    { key: "matched", label: "Same", dot: "matched" },
    { key: "no_entry", label: "Only on their book", dot: "no_entry" },
    { key: "pending", label: SHARED_LEDGER_PARTNER_PENDING_LABEL, dot: "pending" },
    { key: "conflict", label: "Doesn’t match", dot: "conflict" },
  ];

  const sharedCore = (
        <View style={styles.sharedCore}>
          {pendingSyncTxns.length > 0 ? (
            <View style={styles.pendingInboxWrap}>
              <View style={styles.pendingInboxHead}>
                <Text
                  style={[
                    styles.pendingInboxTitle,
                    isWebDesktop && webDesktopStyles.pendingInboxTitle,
                  ]}
                >
                  Needs your attention
                </Text>
                <View style={styles.pendingInboxBadge}>
                  <Text style={styles.pendingInboxBadgeTxt}>New</Text>
                </View>
              </View>
              <View style={styles.pendingInboxGrid}>
                {pendingSyncTxns.map((txn, pendingIdx) => {
                  const tripLabel =
                    missionLabelForTripRef?.(txn.tripRef) ??
                    txn.tripRef.toUpperCase();
                  const routeHint = tripRouteForTripRef?.(txn.tripRef);
                  const pendingAmt = txn.partnerAmount ?? txn.amountAbs;
                  const isGhostTrip = txn.hasLocalTrip === false;
                  const refRaw = (txn.partnerRef ?? "").trim() || "—";
                  const refDisplay =
                    refRaw.length > 14 ? `${refRaw.slice(0, 12)}…` : refRaw;
                  const dateLine =
                    txn.displayDate ??
                    (txn.date && txn.date.length >= 10
                      ? txn.date.slice(0, 10)
                      : null);
                  return (
                    <View
                      key={`pending:${txn.id}`}
                      style={[
                        styles.pendingCardWrap,
                        pendingCardsFullWidth && styles.pendingCardWrapMobile,
                        !pendingCardsFullWidth &&
                          pendingIdx % 3 === 2 &&
                          styles.pendingCardWrapRowEnd,
                      ]}
                    >
                      <View
                        style={[
                          styles.pendingCard,
                          isWebDesktop && webDesktopStyles.pendingCard,
                        ]}
                      >
                        <View style={styles.pendingCardGlow} />
                        <View style={styles.pendingCardTop}>
                          <View style={styles.pendingCardHeaderRow}>
                            <SlgPartnerAvatar
                              partyName={entityName}
                              profileImageUrl={partnerProfileImageUrl}
                              size={34}
                            />
                            <View style={styles.pendingPartyNameWrap}>
                              <Text
                                style={styles.pendingPartyName}
                                numberOfLines={1}
                              >
                                {entityName}
                              </Text>
                            </View>
                            <View style={styles.pendingRefPill}>
                              <Text
                                style={styles.pendingRefPillTxt}
                                numberOfLines={1}
                              >
                                {refDisplay}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.pendingMainRow}>
                            <View style={styles.pendingMainCol}>
                              <Text
                                style={styles.pendingTripDetailLine}
                                numberOfLines={1}
                              >
                                Trip · {tripLabel}
                              </Text>
                              {dateLine ? (
                                <Text
                                  style={styles.pendingTripDetailMuted}
                                  numberOfLines={1}
                                >
                                  {dateLine}
                                </Text>
                              ) : null}
                              {routeHint ? (
                                <Text
                                  style={styles.pendingRouteHint}
                                  numberOfLines={1}
                                >
                                  {routeHint}
                                </Text>
                              ) : isGhostTrip ? (
                                <Text
                                  style={styles.pendingTripDetailMuted}
                                  numberOfLines={2}
                                >
                                  Route will attach after this trip is created in
                                  your book.
                                </Text>
                              ) : null}
                              <View style={styles.pendingBookBadge}>
                                <Text
                                  style={
                                    isGhostTrip
                                      ? styles.pendingBookBadgeGhost
                                      : styles.pendingBookBadgeOk
                                  }
                                  numberOfLines={1}
                                >
                                  {isGhostTrip
                                    ? "Ghost trip (partner book)"
                                    : "In your book"}
                                </Text>
                              </View>
                            </View>
                            <Text
                              style={[
                                styles.pendingHeroAmount,
                                isWebDesktop && webDesktopStyles.pendingHeroAmount,
                              ]}
                              numberOfLines={2}
                            >
                              {formatINR(pendingAmt)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.pendingActionRow}>
                          <Text style={styles.pendingActionHint} numberOfLines={2}>
                            They logged this — add it to your books?
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.pendingActionBtn,
                              isWebDesktop && webDesktopStyles.pendingActionBtn,
                            ]}
                            onPress={() => handleAddPendingSync(txn)}
                            activeOpacity={0.88}
                            disabled={actionLoading || mergeSubmitting}
                          >
                            <Text style={styles.pendingActionBtnTxt}>
                              {isGhostTrip ? "Adopt Trip & Finalize" : "Accept Payment Update"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.toolbarSingleRow}>
            <View style={styles.layoutToggle}>
              <TouchableOpacity
                style={[
                  styles.layoutBtn,
                  viewLayout === "grid" && styles.layoutBtnOn,
                ]}
                onPress={() => setViewLayout("grid")}
                activeOpacity={0.85}
              >
                <LayoutGrid
                  size={16}
                  color={
                    viewLayout === "grid"
                      ? Theme.textPrimaryDark
                      : Theme.textMuted
                  }
                  strokeWidth={2.25}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.layoutBtn,
                  viewLayout === "table" && styles.layoutBtnOn,
                ]}
                onPress={() => setViewLayout("table")}
                activeOpacity={0.85}
              >
                <List
                  size={16}
                  color={
                    viewLayout === "table"
                      ? Theme.textPrimaryDark
                      : Theme.textMuted
                  }
                  strokeWidth={2.25}
                />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.compareToggle,
                isWebDesktop && webDesktopStyles.compareToggle,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.compareBtn,
                  viewMode === "trip" && styles.compareBtnOn,
                  isWebDesktop && webDesktopStyles.compareBtn,
                ]}
                onPress={() => setViewMode("trip")}
              >
                <Text
                  style={[
                    styles.compareBtnTxt,
                    viewMode === "trip" && styles.compareBtnTxtOn,
                    isWebDesktop && webDesktopStyles.compareBtnTxt,
                  ]}
                >
                  By trip
                </Text>
                <View
                  style={[
                    styles.compareCount,
                    viewMode === "trip" && styles.compareCountOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.compareCountTxt,
                      viewMode === "trip" && styles.compareCountTxtOn,
                    ]}
                  >
                    {tripCounts.all}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.compareBtn,
                  viewMode === "txn" && styles.compareBtnOn,
                  isWebDesktop && webDesktopStyles.compareBtn,
                ]}
                onPress={() => setViewMode("txn")}
              >
                <Text
                  style={[
                    styles.compareBtnTxt,
                    viewMode === "txn" && styles.compareBtnTxtOn,
                    isWebDesktop && webDesktopStyles.compareBtnTxt,
                  ]}
                >
                  By payment
                </Text>
                <View
                  style={[
                    styles.compareCount,
                    viewMode === "txn" && styles.compareCountOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.compareCountTxt,
                      viewMode === "txn" && styles.compareCountTxtOn,
                    ]}
                  >
                    {txnCounts.all}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScrollView}
              contentContainerStyle={styles.chipScrollRow}
            >
              {hubFilters.map((f) => {
                const on = statusFilter === f.key;
                const count =
                  f.key === "all" ? activeCounts.all : activeCounts[f.key];
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setStatusFilter(f.key)}
                  >
                    {f.key !== "all" ? (
                      <View
                        style={[
                          styles.chipDot,
                          {
                            backgroundColor:
                              f.dot === "neutral"
                                ? Theme.borderMedium
                                : filterChipDotColor(f.dot),
                          },
                        ]}
                      />
                    ) : null}
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                      {f.label}
                    </Text>
                    <Text style={[styles.chipCnt, on && styles.chipCntOn]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.gridHeader}>
            <Text
              style={[styles.gridTitle, isWebDesktop && webDesktopStyles.gridTitle]}
            >
              Trips & payments
            </Text>
            <View style={styles.gridBadge}>
              <Text style={styles.gridBadgeTxt}>With partner</Text>
            </View>
          </View>

          {viewMode === "trip" ? (
            filteredRows.length === 0 ? (
              <View style={styles.empty}>
                <Inbox size={32} color={Theme.textMuted} strokeWidth={1.75} />
                <Text style={styles.emptyTxt}>
                  No trips match this filter.
                </Text>
              </View>
            ) : (
              viewLayout === "table" ? (
                <View
                  style={[
                    styles.auditTableCard,
                    isWebDesktop && webDesktopStyles.auditTableCard,
                  ]}
                >
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    style={styles.auditTableHScroll}
                    contentContainerStyle={[
                      styles.auditTableHScrollContent,
                      { minWidth: tripFleetTableLayout.tableWidth },
                    ]}
                  >
                    <View
                      style={[
                        styles.auditTableInner,
                        {
                          width: tripFleetTableLayout.tableWidth,
                          minWidth: tripFleetTableLayout.tableWidth,
                        },
                      ]}
                    >
                      <View style={styles.auditThead}>
                        <View style={[styles.auditTh, styles.fleetThMission]}>
                          <Text style={styles.auditThTxt}>Mission</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThRoute]}>
                          <Text style={styles.auditThTxt}>Route</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThPartner]}>
                          <Text style={styles.auditThTxt}>Partner</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThMoney]}>
                          <Text style={[styles.auditThTxt, styles.fleetThTxtTab]}>Sales</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThMoney]}>
                          <Text style={[styles.auditThTxt, styles.fleetThTxtTab]}>Received</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThMoney]}>
                          <Text style={[styles.auditThTxt, styles.fleetThTxtTab]}>Due</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThMetaTxn]}>
                          <Text style={[styles.auditThTxt, styles.fleetThTxtTab]}>Txns</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThMetaLast]}>
                          <Text style={[styles.auditThTxt, styles.auditThTxtCenter]}>Last txn</Text>
                        </View>
                        <View style={[styles.auditTh, styles.fleetThSync]}>
                          <Text style={[styles.auditThTxt, styles.auditThTxtCenter]}>Sync</Text>
                        </View>
                      </View>
                      {filteredRows.map((row) => {
                        const partnerSales = row.external ? row.extSales : null;
                        const partnerPaid = row.external ? row.extPaid : null;
                        const intPaidTrip =
                          entityType === "SUPPLIER"
                            ? row.intPaidOut
                            : row.intPaid;
                        const routeHint = tripRouteForTripRef?.(row.tripId) ?? "—";
                        const txnMeta = tripTxnMetaByRef.get(norm(row.tripId));
                        const mySales = row.intSales;
                        const billingConflict =
                          partnerSales != null &&
                          Math.abs(partnerSales - mySales) >= 0.5;
                        const paymentConflict =
                          partnerPaid != null &&
                          Math.abs(partnerPaid - intPaidTrip) >= 0.5;
                        const syncSafe = !billingConflict && !paymentConflict;
                        return (
                          <TouchableOpacity
                            key={`tbl-trip:${row.tripId}`}
                            style={styles.auditRowFleet}
                            onPress={() => openTripDetail(row)}
                            activeOpacity={0.88}
                          >
                            <View style={styles.fleetCellMission}>
                              {billingConflict ? (
                                <View style={styles.auditConflictBar} />
                              ) : null}
                              <View style={styles.auditIdRow}>
                                <View
                                  style={[
                                    styles.auditIdIcon,
                                    billingConflict && styles.auditIdIconRose,
                                  ]}
                                >
                                  <Truck
                                    size={16}
                                    color={
                                      billingConflict
                                        ? Theme.teslaRed
                                        : Theme.textMuted
                                    }
                                  />
                                </View>
                                <View style={styles.auditIdTextBlock}>
                                  <Text
                                    style={styles.auditIdTitle}
                                    numberOfLines={1}
                                  >
                                    {row.missionId}
                                  </Text>
                                  <Text
                                    style={styles.auditIdMeta}
                                    numberOfLines={1}
                                  >
                                    {tripStatusLabel(row)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                            <View style={styles.fleetCellRoute}>
                              <Text style={styles.fleetRouteText} numberOfLines={2}>
                                {routeHint}
                              </Text>
                            </View>
                            <View style={styles.fleetCellPartner}>
                              <View style={styles.fleetPartnerRow}>
                                <SlgPartnerAvatar
                                  partyName={entityName}
                                  profileImageUrl={partnerProfileImageUrl}
                                  size={28}
                                />
                                <View style={styles.fleetPartnerTextCol}>
                                  <Text style={styles.fleetPartnerName} numberOfLines={2}>
                                    {entityName}
                                  </Text>
                                  <Text style={styles.fleetPartnerSub} numberOfLines={1}>
                                    {partnerSales != null
                                      ? "In partner book"
                                      : SHARED_LEDGER_AWAITING_PARTNER_UPDATE}
                                  </Text>
                                </View>
                              </View>
                            </View>
                            <View style={styles.fleetCellMoney}>
                              <View style={styles.fleetMoneyCol}>
                                <Text style={styles.fleetMoneyVal}>
                                  {row.internal ? formatINR(mySales) : "—"}
                                </Text>
                                <Text
                                  style={[
                                    styles.fleetMoneySub,
                                    billingConflict && styles.fleetMoneySubWarn,
                                  ]}
                                >
                                  {partnerSales != null
                                    ? `Them ${formatINR(partnerSales)}`
                                    : "Them —"}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.fleetCellMoney}>
                              <View style={styles.fleetMoneyCol}>
                                <Text style={[styles.fleetMoneyVal, styles.fleetMoneyGood]}>
                                  {formatINR(intPaidTrip)}
                                </Text>
                                <Text
                                  style={[
                                    styles.fleetMoneySub,
                                    paymentConflict && styles.fleetMoneySubWarn,
                                  ]}
                                >
                                  {partnerPaid != null
                                    ? `Them ${formatINR(partnerPaid)}`
                                    : "Them —"}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.fleetCellMoney}>
                              <View style={styles.fleetMoneyCol}>
                                <Text style={[styles.fleetMoneyVal, styles.fleetMoneyDue]}>
                                  {formatINR(Math.max(0, mySales - intPaidTrip))}
                                </Text>
                                <Text
                                  style={styles.fleetMoneySubSpacer}
                                  accessible={false}
                                  importantForAccessibility="no-hide-descendants"
                                >
                                  {"\u00a0"}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.fleetCellMetaTxn}>
                              <View style={styles.fleetMetaColRight}>
                                <Text style={styles.fleetMetaValTab}>{txnMeta?.count ?? 0}</Text>
                                <Text
                                  style={styles.fleetMoneySubSpacer}
                                  accessible={false}
                                  importantForAccessibility="no-hide-descendants"
                                >
                                  {"\u00a0"}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.fleetCellMetaLast}>
                              <View style={styles.fleetMetaColCenter}>
                                <Text style={styles.fleetMetaValDate} numberOfLines={1}>
                                  {txnMeta?.last ?? "—"}
                                </Text>
                                <Text
                                  style={styles.fleetMoneySubSpacerCenter}
                                  accessible={false}
                                  importantForAccessibility="no-hide-descendants"
                                >
                                  {"\u00a0"}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.fleetCellSync}>
                              <View
                                style={[
                                  styles.fleetSyncIcon,
                                  syncSafe ? styles.fleetSyncIconOk : styles.fleetSyncIconBad,
                                ]}
                              >
                                {syncSafe ? (
                                  <Check size={13} color={Theme.darkGreen} />
                                ) : (
                                  <Zap
                                    size={13}
                                    color={Theme.teslaRed}
                                    fill={Theme.teslaRed}
                                    strokeWidth={2}
                                  />
                                )}
                              </View>
                              <Text
                                style={[
                                  styles.fleetSyncLabel,
                                  syncSafe
                                    ? styles.fleetSyncLabelOk
                                    : styles.fleetSyncLabelBad,
                                ]}
                              >
                                {syncSafe ? "Safe" : "Fix"}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <View style={styles.auditTableFooter}>
                    <View style={styles.auditFooterDot} />
                    <Text style={styles.auditFooterTxt}>
                      Tap a row to open the trip comparison.
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={isWebDesktop ? styles.tripGridWrap : styles.tripGridWrapMobile}
                >
                  {filteredRows.map((row) => {
                const intPaid =
                  entityType === "SUPPLIER" ? row.intPaidOut : row.intPaid;
                const partnerSales = row.external ? row.extSales : null;
                const delta =
                  row.external != null
                    ? row.extSales - row.intSales
                    : null;
                const card = (
                  <TouchableOpacity
                    style={[
                      styles.missionCard,
                      isWebDesktop && webDesktopStyles.missionCard,
                      isWebDesktop && webDesktopStyles.missionCardGrid,
                    ]}
                    onPress={() => openTripDetail(row)}
                    activeOpacity={0.88}
                  >
                    <SlgCardWatermark kind="trip" />
                    <View style={[styles.hubCardAccentBar, hubTripAccentStyle(row)]} />
                    <View
                      style={[
                        styles.missionHead,
                        isWebDesktop && webDesktopStyles.missionHead,
                      ]}
                    >
                      <View style={styles.missionHeadLeft}>
                        <SlgPartnerAvatar
                          partyName={entityName}
                          profileImageUrl={partnerProfileImageUrl}
                          size={44}
                        />
                        <View style={styles.missionTitleBlock}>
                          <View style={styles.missionEntityRow}>
                            <Text
                              style={styles.missionPartnerLineInline}
                              numberOfLines={1}
                            >
                              {entityName}
                            </Text>
                          </View>
                          <View style={styles.missionIdRow}>
                            <Text
                              style={[
                                styles.missionId,
                                isWebDesktop && webDesktopStyles.missionId,
                                styles.missionIdHero,
                              ]}
                              numberOfLines={1}
                            >
                              {row.missionId}
                            </Text>
                            {delta != null && delta !== 0 ? (
                              <Text style={styles.deltaTxtInline} numberOfLines={1}>
                                Diff {formatINR(Math.abs(delta))}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.missionRouteManifest}>
                            <Text
                              style={styles.missionRouteLine}
                              numberOfLines={2}
                            >
                              {tripRouteForTripRef?.(row.tripId) ?? "Route pending"}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.missionCardSummary,
                              isWebDesktop && styles.missionCardSummaryDesktop,
                            ]}
                            numberOfLines={2}
                          >
                            {missionCardSummaryLine(row)}
                          </Text>
                          <View style={styles.missionBadges}>
                            <Text
                              style={[
                                styles.badge,
                                tripBadgeVariant(row),
                                styles.missionStatusBadge,
                              ]}
                            >
                              {tripStatusLabel(row)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.missionChevronWrap}>
                        <SlgIconPulse>
                          <ChevronRight
                            size={24}
                            color={Theme.textMuted}
                            strokeWidth={2.25}
                          />
                        </SlgIconPulse>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.mirrorBlock,
                        isWebDesktop && webDesktopStyles.tripGridMirrorBlock,
                      ]}
                    >
                      <Text
                        style={[
                          styles.mirrorSaleCaption,
                          isWebDesktop &&
                            webDesktopStyles.mirrorSaleCaptionDesktop,
                        ]}
                      >
                        Sale value
                      </Text>
                      <View
                        style={[
                          styles.mirrorColumnsRow,
                          isWebDesktop && webDesktopStyles.tripGridMirrorInner,
                        ]}
                      >
                          <View style={[styles.mirrorMy, styles.mirrorMyHub]}>
                            <Text style={[styles.mirrorLbl, styles.mirrorLblHub]}>
                              {myBookLabel}
                            </Text>
                            <Text style={[styles.mirrorAmt, styles.mirrorAmtHub]}>
                              {row.internal ? formatINR(row.intSales) : "—"}
                            </Text>
                          </View>
                          <View style={styles.bridge}>
                            <View style={styles.bridgeInner}>
                              <SlgIconPulse>
                                {row.status === "MISMATCH" ? (
                                  <Zap
                                    size={14}
                                    color={Theme.teslaRed}
                                    fill={Theme.teslaRed}
                                    strokeWidth={2}
                                  />
                                ) : (
                                  <Activity
                                    size={14}
                                    color={
                                      row.status === "VERIFIED"
                                        ? Theme.darkGreen
                                        : Theme.primary
                                    }
                                    strokeWidth={2.25}
                                  />
                                )}
                              </SlgIconPulse>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.mirrorPartner,
                              !row.external && styles.mirrorPartnerWait,
                              !!row.external && styles.mirrorPartnerHubDark,
                            ]}
                          >
                            <Text
                              style={[
                                styles.mirrorLbl,
                                styles.mirrorLblPartner,
                                styles.mirrorLblHub,
                                !!row.external && styles.hubMirrorLblOnDark,
                              ]}
                            >
                              {partnerLabel}
                            </Text>
                            <Text
                              style={[
                                styles.mirrorAmt,
                                styles.mirrorAmtPartner,
                                styles.mirrorAmtHub,
                                partnerSales == null && row.status === "PENDING"
                                  ? styles.waitTxt
                                  : partnerSales == null
                                    ? styles.waitTxt
                                    : null,
                                partnerSales == null ? styles.waitTxtPartner : null,
                                !!row.external &&
                                  partnerSales != null &&
                                  styles.auditAmtOnDark,
                              ]}
                            >
                              {row.status === "PENDING" && !row.external
                                ? SHARED_LEDGER_PARTNER_PENDING_LABEL
                                : partnerSales != null
                                  ? formatINR(partnerSales)
                                  : "—"}
                            </Text>
                          </View>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.paidRow,
                        isWebDesktop && webDesktopStyles.tripGridPaid,
                      ]}
                    >
                      <View style={styles.paidColumnsRow}>
                        <View style={styles.paidCell}>
                          <Text style={styles.paidLbl}>
                            Paid · {myBookLabel}
                          </Text>
                          <Text style={styles.paidAmt}>
                            {row.internal ? formatINR(intPaid) : "—"}
                          </Text>
                        </View>
                        <View style={styles.bridgeTrackSpacer} />
                        <View style={[styles.paidCell, styles.paidCellRight]}>
                          <Text style={[styles.paidLbl, styles.paidTxtRight]}>
                            Paid · {partnerLabel}
                          </Text>
                          <Text style={[styles.paidAmt, styles.paidTxtRight]}>
                            {row.status === "PENDING" && !row.external
                              ? SHARED_LEDGER_PARTNER_PENDING_LABEL
                              : row.external
                                ? formatINR(row.extPaid)
                                : "—"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
                return (
                  <View key={row.tripId} style={tripHubGridCellStyle}>
                    {card}
                  </View>
                );
                  })}
                </View>
              )
            )
          ) : filteredTxnRows.length === 0 ? (
            <View style={styles.empty}>
              <Inbox size={32} color={Theme.textMuted} strokeWidth={1.75} />
              <Text style={styles.emptyTxt}>
                No payments match this filter.
              </Text>
            </View>
          ) : (
            viewLayout === "table" ? (
              <View
                style={[
                  styles.auditTableCard,
                  isWebDesktop && webDesktopStyles.auditTableCard,
                ]}
              >
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.auditTableHScroll}
                  contentContainerStyle={styles.auditTableHScrollContent}
                >
                  <View style={styles.auditTableInner}>
                    <View style={styles.auditThead}>
                      <View style={[styles.auditTh, styles.auditThId]}>
                        <Text style={styles.auditThTxt}>Record ID</Text>
                      </View>
                      <View style={[styles.auditTh, styles.hubDualThBilled]}>
                        <Text style={[styles.auditThTxt, styles.hubDualThTitleCenter]}>
                          Billed
                        </Text>
                        <Text style={styles.hubDualThSub}>You vs partner</Text>
                      </View>
                      <View style={[styles.auditTh, styles.hubDualThVerified]}>
                        <Text style={[styles.auditThTxt, styles.hubDualThTitleCenter]}>
                          Payment
                        </Text>
                        <Text style={styles.hubDualThSub}>You vs partner</Text>
                      </View>
                      <View style={[styles.auditTh, styles.hubDualThSync]}>
                        <Text style={[styles.auditThTxt, styles.auditThTxtCenter]}>
                          Sync
                        </Text>
                      </View>
                    </View>
                    {filteredTxnRows.map((txn) => {
                      const p = partnerColumnRupees(txn);
                      const localAmt = localColumnRupees(txn);
                      const billingConflict =
                        p != null && Math.abs(p - localAmt) >= 0.5;
                      const syncSafe = !billingConflict;
                      const dateLine =
                        txn.displayDate ?? txn.date.slice(0, 10);
                      return (
                        <TouchableOpacity
                          key={`tbl-txn:${txn.id}`}
                          style={styles.auditRow}
                          onPress={() => openTxnForensic(txn)}
                          activeOpacity={0.88}
                        >
                          <View style={styles.auditCellId}>
                            {billingConflict ? (
                              <View style={styles.auditConflictBar} />
                            ) : null}
                            <View style={styles.auditIdRow}>
                              <View
                                style={[
                                  styles.auditIdIcon,
                                  billingConflict && styles.auditIdIconRose,
                                ]}
                              >
                                <Layers
                                  size={18}
                                  color={
                                    billingConflict
                                      ? Theme.teslaRed
                                      : Theme.textMuted
                                  }
                                />
                              </View>
                              <View style={styles.auditIdTextBlock}>
                                <Text
                                  style={styles.auditIdTitle}
                                  numberOfLines={1}
                                >
                                  {shortTxnId(txn.id)}
                                </Text>
                                <Text
                                  style={styles.auditIdMeta}
                                  numberOfLines={1}
                                >
                                  {dateLine}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.hubDualCellBilled,
                              billingConflict && styles.hubDualCellBilledWarn,
                            ]}
                          >
                            <Text style={styles.hubDualYouLine}>
                              You: {formatINR(localAmt)}
                            </Text>
                            <Text
                              style={[
                                styles.hubDualTheyLine,
                                billingConflict && styles.hubDualTheyLineWarn,
                              ]}
                              numberOfLines={2}
                            >
                              {p != null
                                ? `They say: ${formatINR(p)}`
                                : SHARED_LEDGER_AWAITING_PARTNER_UPDATE}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.hubDualCellVerified,
                              billingConflict &&
                                styles.hubDualCellVerifiedWarn,
                            ]}
                          >
                            <Text style={styles.hubDualVerifiedYouLine}>
                              {entityType === "CLIENT"
                                ? `You received: ${formatINR(localAmt)}`
                                : `You paid: ${formatINR(localAmt)}`}
                            </Text>
                            <Text
                              style={[
                                styles.hubDualVerifiedTheyLine,
                                billingConflict &&
                                  styles.hubDualVerifiedTheyLineWarn,
                              ]}
                              numberOfLines={2}
                            >
                              {p != null
                                ? `They say: ${formatINR(p)}`
                                : SHARED_LEDGER_AWAITING_PARTNER_UPDATE}
                            </Text>
                          </View>
                          <HubDualSyncCell safe={syncSafe} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                <View style={styles.auditTableFooter}>
                  <View style={styles.auditFooterDot} />
                  <Text style={styles.auditFooterTxt}>
                    Tap a row to open payment details.
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={
                  isWebDesktop ? styles.tripGridWrap : styles.tripGridWrapMobile
                }
              >
                {filteredTxnRows.map((txn) => {
                  const localAmt = localColumnRupees(txn);
                  const pAmt = partnerColumnRupees(txn);
                  const diff =
                    pAmt != null && Math.abs(pAmt - localAmt) >= 0.5
                      ? pAmt - localAmt
                      : null;
                  const bridgeOk = paymentBridgeCheckAligned(txn);
                  return (
                    <View key={txn.id} style={tripHubGridCellStyle}>
                      <TouchableOpacity
                        style={[
                          styles.missionCard,
                          styles.txnCardGrid,
                          isWebDesktop && webDesktopStyles.missionCard,
                          isWebDesktop && webDesktopStyles.missionCardGrid,
                        ]}
                        onPress={() => openTxnForensic(txn)}
                        activeOpacity={0.88}
                      >
                        <SlgCardWatermark kind="payment" />
                        <View style={[styles.hubCardAccentBar, hubTxnAccentStyle(txn)]} />
                        <View
                          style={[
                            styles.missionHead,
                            isWebDesktop && webDesktopStyles.missionHead,
                          ]}
                        >
                          <View style={styles.missionHeadLeft}>
                            <SlgPartnerAvatar
                              partyName={entityName}
                              profileImageUrl={partnerProfileImageUrl}
                              size={40}
                            />
                            <View style={styles.missionTitleBlock}>
                              <View style={styles.missionEntityRow}>
                                <Text
                                  style={styles.missionPartnerLineInline}
                                  numberOfLines={1}
                                >
                                  {entityName}
                                </Text>
                              </View>
                              <View style={styles.missionIdRow}>
                                <Text
                                  style={[
                                    styles.missionId,
                                    isWebDesktop && webDesktopStyles.missionId,
                                    styles.missionIdHero,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {missionLabelForTripRef?.(txn.tripRef) ??
                                    `Trip ${txn.tripRef.slice(0, 8)}`}
                                </Text>
                                {diff != null ? (
                                  <Text
                                    style={styles.deltaTxtInline}
                                    numberOfLines={1}
                                  >
                                    Diff {formatINR(Math.abs(diff))}
                                  </Text>
                                ) : null}
                              </View>
                              <Text
                                style={styles.txnGridDateLine}
                                numberOfLines={1}
                              >
                                {txn.displayDate ?? txn.date.slice(0, 10)}
                              </Text>
                              <Text
                                style={styles.missionCardSummary}
                                numberOfLines={2}
                              >
                                {`Trip: ${
                                  (txn.tripRef &&
                                    (missionLabelForTripRef?.(txn.tripRef) ??
                                      `${String(txn.tripRef).slice(0, 8).toUpperCase()}…`)) ||
                                  "—"
                                } · Paid via: ${txn.myMode ?? txn.partnerMode ?? "—"}`}
                              </Text>
                              <View style={styles.missionBadges}>
                                <Text
                                  style={[
                                    styles.badge,
                                    txnBadgeVariant(txn),
                                    styles.missionStatusBadge,
                                  ]}
                                >
                                  {txnPillLabel(txn.status)}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.missionChevronWrap}>
                            <SlgIconPulse>
                              <ChevronRight
                                size={24}
                                color={Theme.textMuted}
                                strokeWidth={2.25}
                              />
                            </SlgIconPulse>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.mirrorBlock,
                            isWebDesktop && webDesktopStyles.tripGridMirrorBlock,
                          ]}
                        >
                          <Text
                            style={[
                              styles.mirrorSaleCaption,
                              isWebDesktop &&
                                webDesktopStyles.mirrorSaleCaptionDesktop,
                            ]}
                          >
                            Payment
                          </Text>
                          <View
                            style={[
                              styles.mirrorColumnsRow,
                              isWebDesktop &&
                                webDesktopStyles.tripGridMirrorInner,
                            ]}
                          >
                              <View style={[styles.mirrorMy, styles.mirrorMyHub]}>
                                <Text style={[styles.mirrorLbl, styles.mirrorLblHub]}>
                                  {myBookLabel}
                                </Text>
                                <Text style={[styles.mirrorAmt, styles.mirrorAmtHub]}>
                                  {formatINR(localAmt)}
                                </Text>
                              </View>
                              <View style={styles.bridge}>
                                <View style={styles.bridgeInner}>
                                  <SlgIconPulse>
                                    {txn.status === "conflict" && !bridgeOk ? (
                                      <Zap
                                        size={14}
                                        color={Theme.teslaRed}
                                        fill={Theme.teslaRed}
                                        strokeWidth={2}
                                      />
                                    ) : (
                                      <Activity
                                        size={14}
                                        color={
                                          txn.status === "matched" || bridgeOk
                                            ? Theme.darkGreen
                                            : Theme.primary
                                        }
                                        strokeWidth={2.25}
                                      />
                                    )}
                                  </SlgIconPulse>
                                </View>
                              </View>
                              <View
                                style={[
                                  styles.mirrorPartner,
                                  pAmt == null &&
                                    txn.status === "pending" &&
                                    styles.mirrorPartnerWait,
                                  pAmt != null && styles.mirrorPartnerHubDark,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.mirrorLbl,
                                    styles.mirrorLblPartner,
                                    styles.mirrorLblHub,
                                    pAmt != null && styles.hubMirrorLblOnDark,
                                  ]}
                                >
                                  {partnerLabel}
                                </Text>
                                <Text
                                  style={[
                                    styles.mirrorAmt,
                                    styles.mirrorAmtPartner,
                                    styles.mirrorAmtHub,
                                    pAmt == null && txn.status === "pending"
                                      ? styles.waitTxt
                                      : pAmt == null
                                        ? styles.waitTxt
                                        : null,
                                    pAmt == null ? styles.waitTxtPartner : null,
                                    pAmt != null && styles.auditAmtOnDark,
                                  ]}
                                >
                                  {txn.status === "pending" && pAmt == null
                                    ? SHARED_LEDGER_PARTNER_PENDING_LABEL
                                    : pAmt != null
                                      ? formatINR(pAmt)
                                      : "—"}
                                </Text>
                              </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )
          )}
        </View>
  );

  const renderHub = () => (
    <>
      {!embeddedInOverlay ? (
        <View style={styles.heroHeader}>
          <View style={styles.heroHeaderSpacer} />
          <View style={styles.heroHeaderCenter}>
            <View style={styles.heroEntityRow}>
              <SlgPartnerAvatar
                partyName={entityName}
                profileImageUrl={partnerProfileImageUrl}
                size={40}
              />
              <View style={styles.heroEntityTextCol}>
                <Text
                  style={[
                    styles.heroEntityTitle,
                    isWebDesktop && webDesktopStyles.heroEntityTitle,
                  ]}
                  numberOfLines={1}
                >
                  {entityName}
                </Text>
                <Text
                  style={[
                    styles.heroEntitySub,
                    isWebDesktop && webDesktopStyles.heroEntitySub,
                  ]}
                >
                  Compare books with your partner
                </Text>
              </View>
            </View>
          </View>
          {onPressDownload ? (
            <TouchableOpacity
              style={styles.heroDlBtn}
              onPress={onPressDownload}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Download shared ledger report"
            >
              <CloudDownload size={22} color="#FFFFFF" strokeWidth={2.25} />
            </TouchableOpacity>
          ) : (
            <View style={styles.heroDlBtn}>
              <CloudDownload size={22} color="#FFFFFF" strokeWidth={2.25} />
            </View>
          )}
        </View>
      ) : null}

      {!embeddedInOverlay ? (
        <>
          <View style={styles.mainTabs}>
            {(["Trips", "Cash Flow", "Shared"] as MainTab[]).map((tab) => {
              const on = mainTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.mainTab,
                    on && styles.mainTabOn,
                    isWebDesktop && webDesktopStyles.mainTab,
                  ]}
                  onPress={() => setMainTab(tab)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.mainTabTxt,
                      on && styles.mainTabTxtOn,
                      isWebDesktop && webDesktopStyles.mainTabTxt,
                    ]}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {mainTab !== "Shared" ? (
            <View style={styles.restricted}>
              <Loader2 size={44} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.restrictedTitle}>Use the Shared tab</Text>
              <Text style={styles.restrictedSub}>
                Trip and cash lists here are coming soon. Open Shared to compare
                amounts with this partner.
              </Text>
            </View>
          ) : (
            sharedCore
          )}
        </>
      ) : (
        sharedCore
      )}
    </>
  );

  const renderTripDetail = () => {
    if (!tripFocus) return null;
    const r = tripFocus;
    const tripDashStatusKind =
      r.status === "VERIFIED"
        ? ("ok" as const)
        : r.status === "MISMATCH"
          ? ("bad" as const)
          : ("neutral" as const);
    const netDelta =
      r.external != null ? r.extSales - r.intSales : null;
    const intPaidR =
      entityType === "SUPPLIER" ? r.intPaidOut : r.intPaid;
    const netPaidDelta =
      r.external != null ? r.extPaid - intPaidR : null;
    let payYouSum = 0;
    let payPartnerSum = 0;
    let partnerPendingLines = 0;
    for (const x of tripTxns) {
      payYouSum += localColumnRupees(x);
      const pr = partnerColumnRupees(x);
      if (pr == null) partnerPendingLines += 1;
      else payPartnerSum += pr;
    }
    const hasTaggedLedgerLines = tripTxns.some((x) => !!x.lineKind);
    const showAdjustmentsCallout =
      tripAdjustments.length > 0 || hasTaggedLedgerLines;
    return (
      <View style={[styles.subScreen, detailShellLayoutStyle]}>
        <View style={[styles.subHeader, { paddingTop: 8 + insets.top }]}>
          <TouchableOpacity style={styles.subBack} onPress={backFromSub}>
            <ArrowLeft size={22} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <View style={styles.subHeaderCenter}>
            <Text
              style={[styles.subTitle, isWebDesktop && webDesktopStyles.subTitle]}
            >
              {r.missionId} command
            </Text>
            <Text style={styles.subSub}>Compare charges & payments</Text>
          </View>
          <TouchableOpacity
            style={styles.tripDetailPhoneBtn}
            onPress={() => {}}
            hitSlop={12}
            activeOpacity={0.85}
          >
            <Phone size={18} color={Theme.textPrimaryDark} strokeWidth={2.25} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={Platform.OS === "web" ? styles.detailScrollWeb : undefined}
          contentContainerStyle={[styles.subScroll, { paddingBottom: 48 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tripDashHero}>
            <View style={styles.tripDashHeroGlow} />
            <View style={styles.tripDashHeroTop}>
              <View style={styles.tripDashHeroTag}>
                <Target
                  size={18}
                  color={Theme.textOnDarkMuted}
                  strokeWidth={2.25}
                />
                <Text style={styles.tripDashTagTxt}>Current review</Text>
              </View>
              <View
                style={[
                  styles.tripDashStatusPill,
                  tripDashStatusKind === "ok" && styles.tripDashStatusPillOk,
                  tripDashStatusKind === "bad" && styles.tripDashStatusPillBad,
                ]}
              >
                <Text
                  style={[
                    styles.tripDashStatusTxt,
                    tripDashStatusKind === "ok" && styles.tripDashStatusTxtOk,
                    tripDashStatusKind === "bad" && styles.tripDashStatusTxtBad,
                  ]}
                >
                  {r.status === "MISMATCH" ? "Needs review" : tripStatusLabel(r)}
                </Text>
              </View>
            </View>
            <View style={styles.tripDashPartnerStrip}>
              <SlgPartnerAvatar
                partyName={entityName}
                profileImageUrl={partnerProfileImageUrl}
                size={36}
              />
              <Text style={styles.tripDashPartnerStripName} numberOfLines={1}>
                {entityName}
              </Text>
            </View>
            <View style={styles.tripDashBlock}>
              <View style={styles.tripDashBlockHdr}>
                <Text style={styles.tripDashBlockHdrLblFull}>
                  Your billed vs partner book
                </Text>
              </View>
              <View style={styles.tripDashGrid2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripDashMicro}>You record</Text>
                  <Text style={styles.tripDashBig}>
                    {r.internal ? formatINR(r.intSales) : "—"}
                  </Text>
                </View>
                <View style={styles.tripDashColRight}>
                  <Text style={styles.tripDashMicroPartner}>They record</Text>
                  <Text style={styles.tripDashBigPartner}>
                    {r.external
                      ? formatINR(r.extSales)
                      : "—"}
                  </Text>
                  {r.external != null &&
                  netDelta != null &&
                  Math.abs(netDelta) >= 0.5 ? (
                    <Text style={styles.tripDashPartnerSubDelta}>
                      Δ {formatINR(Math.abs(netDelta))}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={styles.tripDashBlock}>
              <View style={styles.tripDashBlockHdr}>
                <Text style={styles.tripDashBlockHdrLblFull}>
                  Your payments vs partner paid
                </Text>
              </View>
              <View style={styles.tripDashGrid2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripDashMicro}>You record</Text>
                  <Text style={styles.tripDashBig}>{formatINR(intPaidR)}</Text>
                </View>
                <View style={styles.tripDashColRight}>
                  <Text style={styles.tripDashMicroPartner}>They record</Text>
                  <Text style={styles.tripDashBigPartner}>
                    {r.external ? formatINR(r.extPaid) : "—"}
                  </Text>
                  {r.external != null &&
                  netPaidDelta != null &&
                  Math.abs(netPaidDelta) >= 0.5 ? (
                    <Text style={styles.tripDashPartnerSubDelta}>
                      Δ {formatINR(Math.abs(netPaidDelta))}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          {showAdjustmentsCallout ? (
            <View style={styles.tripDashAdjustBanner}>
              <View style={styles.tripDashAdjustIconWrap}>
                <Tag size={15} color={Theme.textPrimaryDark} strokeWidth={2.25} />
              </View>
              <View style={styles.tripDashAdjustBody}>
                <Text style={styles.tripDashAdjustTitle}>
                  Charges & deductions marked
                </Text>
                <Text style={styles.tripDashAdjustSub}>
                  {tripAdjustments.length > 0
                    ? "Trip adjustment registry entries below change how sale/cost compares to individual payment lines."
                    : "Some lines in the table are tagged as add-ons, deductions, or adjustments — totals may not match a single payment."}
                </Text>
                {tripAdjustments.length > 0 ? (
                  <View style={styles.tripDashAdjustList}>
                    {tripAdjustments.map((a) => (
                      <View key={a.id} style={styles.tripDashAdjustRow}>
                        <Text style={styles.tripDashAdjustReason} numberOfLines={2}>
                          {a.reason}
                        </Text>
                        <Text style={styles.tripDashAdjustAmt} numberOfLines={1}>
                          {a.type === "revenue" ? "Sale" : "Cost"} ·{" "}
                          {a.impact === "plus" ? "+" : "−"}
                          {formatINR(a.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {tripTxns.length > 0 ? (
            <View style={styles.detailPaymentRollup}>
              <Text style={styles.detailPaymentRollupTitle}>
                Total of payments in this list
              </Text>
              <Text style={styles.detailPaymentRollupBody}>
                <Text style={styles.detailPaymentRollupEm}>You </Text>
                {formatINR(payYouSum)}
                <Text style={styles.detailPaymentRollupEm}> · Partner </Text>
                {partnerPendingLines === tripTxns.length ? (
                  <Text style={styles.detailPaymentRollupAwait}>
                    {SHARED_LEDGER_PARTNER_PENDING_LABEL}
                  </Text>
                ) : (
                  <Text>
                    {formatINR(payPartnerSum)}
                    {partnerPendingLines > 0 &&
                    partnerPendingLines < tripTxns.length
                      ? ` (${partnerPendingLines} line${partnerPendingLines === 1 ? "" : "s"} only on your book)`
                      : ""}
                  </Text>
                )}
              </Text>
              {Math.abs(payYouSum - intPaidR) >= 0.5 && showAdjustmentsCallout ? (
                <Text style={styles.detailPaymentRollupHint}>
                  “You record” above is {formatINR(intPaidR)}; this list sums to{" "}
                  {formatINR(payYouSum)} — difference may include marked charges or
                  deductions.
                </Text>
              ) : null}
            </View>
          ) : null}

          {tripTxns.length > 0 ? (
            <View style={styles.tripDashTableCard}>
              <View style={styles.tripDashTableHead}>
                <Text
                  style={[styles.tripDashTh, styles.tripDashThTxnCol]}
                  numberOfLines={1}
                >
                  TXN ID
                </Text>
                <Text style={[styles.tripDashTh, styles.tripDashThMine]}>
                  My book
                </Text>
                <Text style={[styles.tripDashTh, styles.tripDashThPartnerCol]}>
                  Partner
                </Text>
                <Text style={[styles.tripDashTh, styles.tripDashThLast]}>
                  Check
                </Text>
              </View>
              {tripTxns.map((txn) => {
                const myAmt = localColumnRupees(txn);
                const partnerAmt = partnerColumnRupees(txn);
                const rowMatch = paymentBridgeCheckAligned(txn);
                const entrySubtitle =
                  txn.displayDate ?? txn.date.slice(0, 10);
                const partnerMismatch = !rowMatch;
                const partnerPending = partnerAmt == null;
                const refSnip = txnRefSnippetForRow(txn);
                return (
                  <TouchableOpacity
                    key={txn.id}
                    style={styles.tripDashTr}
                    onPress={() => {
                      setTxnFocus(txn);
                      setScreen("txn");
                    }}
                    activeOpacity={0.92}
                  >
                    <View style={[styles.tripDashTd, styles.tripDashTdTxn]}>
                      <Text style={styles.tripDashTxnTitle}>
                        {txnLedgerLineId(txn)}
                      </Text>
                      <Text style={styles.tripDashTxnDate}>{entrySubtitle}</Text>
                      {refSnip ? (
                        <Text style={styles.tripDashTxnRef} numberOfLines={1}>
                          Ref · {refSnip}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.tripDashTd, styles.tripDashTdMine]}>
                      <Text style={styles.tripDashAmtMine}>
                        {formatINR(myAmt)}
                      </Text>
                      {txn.lineKind ? (
                        <View style={styles.tripDashLineKindPill}>
                          <Text style={styles.tripDashLineKindTxt}>
                            {lineKindShortLabel(txn.lineKind)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.tripDashTd,
                        styles.tripDashTdPartner,
                        partnerMismatch
                          ? styles.tripDashTdPartnerWarn
                          : styles.tripDashTdPartnerDark,
                      ]}
                    >
                      {partnerPending ? (
                        <Text style={styles.tripDashAmtPartnerPending}>
                          {SHARED_LEDGER_PARTNER_PENDING_LABEL}
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.tripDashAmtPartner,
                            partnerMismatch && styles.tripDashAmtPartnerBad,
                          ]}
                        >
                          {formatINR(partnerAmt)}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.tripDashTd, styles.tripDashTdSync]}>
                      <View
                        style={[
                          styles.tripDashCheckWrap,
                          rowMatch
                            ? styles.tripDashCheckOk
                            : styles.tripDashCheckBad,
                        ]}
                      >
                        {rowMatch ? (
                          <Check
                            size={18}
                            color={Theme.darkGreen}
                            strokeWidth={3}
                          />
                        ) : (
                          <Zap
                            size={17}
                            color={Theme.teslaRed}
                            fill={Theme.teslaRed}
                            strokeWidth={2}
                          />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.bridgeEmptyHint}>
              <Text style={styles.bridgeEmptyHintTxt}>
                No payments linked to this trip yet.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderTxnForensic = () => {
    if (!txnFocus) return null;
    const t = txnFocus;
    const myAmt = localColumnRupees(t);
    const partnerAmt = partnerColumnRupees(t);
    const tripForTxn = findTripByRef(t.tripRef);
    const sameTripTxnCount = txnRowsAll.filter(
      (row) => norm(row.tripRef) === norm(t.tripRef),
    ).length;
    const tripLevelPartnerPaid =
      tripForTxn && sameTripTxnCount === 1 && (tripForTxn.extPaid ?? 0) > 0
        ? Number(tripForTxn.extPaid ?? 0)
        : null;
    const usingTripLevelFallback = partnerAmt == null && tripLevelPartnerPaid != null;
    const resolvedPartnerAmt = partnerAmt ?? tripLevelPartnerPaid;
    const deltaAbs =
      resolvedPartnerAmt == null ? 0 : Math.abs(myAmt - resolvedPartnerAmt);
    const matchAmt =
      resolvedPartnerAmt != null && deltaAbs < 0.5;
    const tripDisplay =
      (t.tripRef &&
        (missionLabelForTripRef?.(t.tripRef) ??
          `${String(t.tripRef).slice(0, 8).toUpperCase()}…`)) ||
      "—";
    const leftRef = tripDisplay;
    const rightRef = tripDisplay;
    const matchRef = true;
    const leftMode = displayLedgerToken(t.myMode);
    const rightMode = usingTripLevelFallback
      ? leftMode
      : displayLedgerToken(t.partnerMode);
    const matchMode = usingTripLevelFallback
      ? true
      : normLedgerToken(t.myMode) === normLedgerToken(t.partnerMode);
    const forensicRows = [
      ...(t.lineKind
        ? [
            {
              label: "Marked as",
              left: lineKindShortLabel(t.lineKind),
              right: "—",
              match: true,
            },
          ]
        : []),
      {
        label: "Amount",
        left: formatINR(myAmt),
        right:
          resolvedPartnerAmt == null
            ? SHARED_LEDGER_PARTNER_PENDING_LABEL
            : formatINR(resolvedPartnerAmt),
        match: matchAmt,
      },
      {
        label: "Trip ID",
        left: leftRef,
        right: rightRef,
        match: matchRef,
      },
      {
        label: "Payment via",
        left: leftMode,
        right: rightMode,
        match: matchMode,
      },
    ];
    const syncLabel = t.displayDate ?? t.date.slice(0, 10);
    const fullyAligned = matchAmt && matchRef && matchMode;
    const gapRupees =
      resolvedPartnerAmt == null ? null : Math.abs(myAmt - resolvedPartnerAmt);

    return (
      <View style={[styles.subScreen, detailShellLayoutStyle]}>
        <View style={[styles.subHeader, { paddingTop: 8 + insets.top }]}>
          <TouchableOpacity
            style={styles.subBack}
            onPress={() => {
              if (tripFocus && screen === "txn") {
                setTxnFocus(null);
                setScreen("trip");
              } else {
                backFromSub();
              }
            }}
          >
            <ArrowLeft size={22} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <View style={styles.subHeaderCenter}>
            <Text
              style={[
                styles.forensicRefTitle,
                isWebDesktop && webDesktopStyles.subTitleForensic,
              ]}
              numberOfLines={1}
            >
              {tripDisplay} · review
            </Text>
            <Text style={styles.forensicRefSub}>Entry comparison</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView
          style={Platform.OS === "web" ? styles.detailScrollWeb : undefined}
          contentContainerStyle={[
            styles.subScrollForensic,
            isWebDesktop && webDesktopStyles.subScrollForensic,
            { paddingBottom: 120 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.forensicDiagCard,
              fullyAligned && styles.forensicDiagCardAligned,
            ]}
          >
            <View
              style={[
                styles.forensicDiagGlow,
                fullyAligned && styles.forensicDiagGlowAligned,
              ]}
            />
            <View style={styles.forensicDiagInner}>
              <View
                style={[
                  styles.forensicDiagBadge,
                  fullyAligned && styles.forensicDiagBadgeAligned,
                ]}
              >
                <Text
                  style={[
                    styles.forensicDiagBadgeTxt,
                    fullyAligned && styles.forensicDiagBadgeTxtAligned,
                  ]}
                >
                  {fullyAligned
                    ? "Verified"
                    : resolvedPartnerAmt == null
                      ? "Awaiting partner"
                      : "Found a difference"}
                </Text>
              </View>
              <Text style={styles.forensicDiagBody}>
                {fullyAligned ? (
                  <>
                    The amount, trip ID, and payment route{" "}
                    <Text style={styles.forensicDiagEm}>match</Text> on both
                    books.
                  </>
                ) : resolvedPartnerAmt == null ? (
                  <>
                    You’ve logged this payment; your partner hasn’t shared their
                    line for it yet — their amount shows as{" "}
                    <Text style={styles.forensicDiagEm}>
                      {SHARED_LEDGER_PARTNER_PENDING_LABEL}
                    </Text>
                    .
                  </>
                ) : !matchAmt ? (
                  <>
                    You say{" "}
                    <Text style={styles.forensicDiagEm}>{formatINR(myAmt)}</Text>{" "}
                    but partner recorded{" "}
                    <Text style={styles.forensicDiagAmt}>
                      {formatINR(resolvedPartnerAmt)}
                    </Text>
                    . A gap of{" "}
                    <Text style={styles.forensicDiagAmt}>
                      {gapRupees != null ? formatINR(gapRupees) : "—"}
                    </Text>{" "}
                    exists.
                  </>
                ) : (
                  <>
                    The amount matches, but{" "}
                    <Text style={styles.forensicDiagEm}>
                      {!matchRef && !matchMode
                        ? "trip ID and payment via"
                        : !matchRef
                          ? "trip ID"
                          : "payment via"}
                    </Text>{" "}
                    still differs below.
                  </>
                )}
              </Text>
            </View>
          </View>

          <View style={styles.forensicMirrorHeaderRow}>
            <Text style={styles.forensicMirrorHeaderLbl}>
              Itemised breakdown
            </Text>
            <View style={styles.forensicSyncBadge}>
              <Text style={styles.forensicSyncBadgeTxt}>
                Point date: {syncLabel}
              </Text>
            </View>
          </View>

          <View style={styles.forensicEntryTable}>
            <View style={styles.forensicEntryHead}>
              <Text style={[styles.forensicEntryTh, styles.forensicEntryThDetail]}>
                Details
              </Text>
              <Text style={[styles.forensicEntryTh, styles.forensicEntryThMine]}>
                Your book
              </Text>
              <Text style={styles.forensicEntryTh}>Partner book</Text>
              <Text style={[styles.forensicEntryTh, styles.forensicEntryThSync]}>
                Sync
              </Text>
            </View>
            {forensicRows.map((line, i) => (
              <View
                key={line.label}
                style={[
                  styles.forensicEntryRow,
                  i === forensicRows.length - 1 && styles.forensicEntryRowLast,
                ]}
              >
                <View style={[styles.forensicEntryTd, styles.forensicEntryTdDetail]}>
                  <Text style={styles.forensicEntryDetailLbl}>{line.label}</Text>
                </View>
                <View style={[styles.forensicEntryTd, styles.forensicEntryTdMine]}>
                  <Text style={styles.forensicEntryMineVal} numberOfLines={3}>
                    {line.left}
                  </Text>
                </View>
                <View
                  style={[
                    styles.forensicEntryTd,
                    !line.match && styles.forensicEntryTdPartnerWarn,
                  ]}
                >
                  <Text
                    style={[
                      styles.forensicEntryPartnerVal,
                      !line.match && styles.forensicEntryPartnerValBad,
                    ]}
                    numberOfLines={3}
                  >
                    {line.right}
                  </Text>
                </View>
                <View style={[styles.forensicEntryTd, styles.forensicEntryTdSync]}>
                  {line.match ? (
                    <CheckCircle2 size={20} color={Theme.darkGreen} />
                  ) : (
                    <Zap
                      size={18}
                      color={Theme.teslaRed}
                      fill={Theme.teslaRed}
                      strokeWidth={2}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.fabBar, { bottom: 16 + insets.bottom }]}>
          <TouchableOpacity
            style={styles.fabUse}
            onPress={handleUsePartnerFromTxn}
            disabled={actionLoading}
            activeOpacity={0.88}
          >
            <Check size={16} color="#FFF" strokeWidth={3} />
            <Text style={styles.fabUseTxt}>Sync to partner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fabDispute}
            onPress={handleDisputeFromTxn}
            disabled={actionLoading}
            activeOpacity={0.88}
          >
            <AlertCircle size={18} color="#FFF" strokeWidth={2.5} />
            <Text style={styles.fabDisputeTxt}>Fix records</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, screen !== "hub" && rootWebDetailStyle]}>
      {screen === "hub" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isWebDesktop && webDesktopStyles.scrollContent,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {renderHub()}
        </ScrollView>
      ) : null}
      {screen === "trip" ? renderTripDetail() : null}
      {screen === "txn" ? renderTxnForensic() : null}

      <Modal
        visible={!!mergePreview}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
        onRequestClose={() => !mergeSubmitting && setMergePreview(null)}
      >
        <View style={styles.mergeModalRoot}>
          <View
            style={[
              styles.mergeModalHeader,
              { paddingTop: 16 + insets.top },
            ]}
          >
            <TouchableOpacity
              style={styles.mergeModalCloseBtn}
              onPress={() => !mergeSubmitting && setMergePreview(null)}
              hitSlop={12}
            >
              <X size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles.mergeModalHeaderCenter}>
              <Text style={styles.mergeModalHeaderTitle}>
                {mergePreview?.hasLocalTrip === false
                  ? "Trip adoption required"
                  : "Review before adding"}
              </Text>
              <Text style={styles.mergeModalHeaderSub}>
                {mergePreview?.hasLocalTrip === false
                  ? "Create trip and accept payment"
                  : "Add payment to your cash book"}
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView
            style={styles.mergeModalScroll}
            contentContainerStyle={[
              styles.mergeModalBody,
              { paddingBottom: 28 + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {mergePreview ? (
              <>
                {mergePreview.hasLocalTrip === false ? (
                  <View style={styles.mergeGhostNotice}>
                    <Text style={styles.mergeGhostNoticeTitle}>
                      Ghost trip from partner book
                    </Text>
                    <Text style={styles.mergeGhostNoticeText}>
                      We will first create this trip in your local book, then post
                      this payment entry and link both records.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.mergeHeroBlock}>
                  <View style={styles.mergeBadge}>
                    <Text style={styles.mergeBadgeTxt}>
                      {missionLabelForTripRef?.(mergePreview.tripRef) ??
                        mergePreview.tripRef.toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.mergeHeroAmt,
                      isWebDesktop && webDesktopStyles.mergeHeroAmt,
                    ]}
                  >
                    {formatINR(mergePreview.partnerAmount ?? mergePreview.amountAbs)}
                  </Text>
                  <View style={styles.mergePartyRow}>
                    <SlgPartnerAvatar
                      partyName={entityName}
                      profileImageUrl={partnerProfileImageUrl}
                      size={44}
                    />
                    <Text style={styles.mergeParty}>{entityName}</Text>
                  </View>
                  {tripRouteForTripRef?.(mergePreview.tripRef) ? (
                    <Text style={styles.mergeRoute}>
                      {tripRouteForTripRef(mergePreview.tripRef)}
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.mergeSectionTitle}>What they entered</Text>
                <View style={styles.mergeDetailCard}>
                  <MergeRow
                    label="Date"
                    value={
                      mergePreview.date && mergePreview.date.length >= 10
                        ? mergePreview.date.slice(0, 10)
                        : mergePreview.displayDate ?? "—"
                    }
                  />
                  <MergeRow
                    label="Trip"
                    value={
                      missionLabelForTripRef?.(mergePreview.tripRef) ??
                      mergePreview.tripRef.toUpperCase()
                    }
                  />
                  <MergeRow
                    label="Amount (partner)"
                    value={formatINR(mergePreview.partnerAmount ?? mergePreview.amountAbs)}
                  />
                  <MergeRow label="Partner ref" value={mergePreview.partnerRef ?? "—"} />
                  <MergeRow
                    label="Their record id"
                    value={shortIdForDisplay(mergePreview.id)}
                    last
                  />
                </View>

                <Text
                  style={[styles.mergeSectionTitle, styles.mergeSectionTitleAfterCard]}
                >
                  What we’ll add for you
                </Text>
                <View style={styles.mergeWillCard}>
                  {mergePreview.hasLocalTrip === false ? (
                    <Text style={styles.mergeWillLine}>
                      • Create missing trip in your book (keeps partner trip ref for audit).
                    </Text>
                  ) : null}
                  <Text style={styles.mergeWillLine}>
                    • One payment of {formatINR(mergePreview.partnerAmount ?? mergePreview.amountAbs)}{" "}
                    {entityType === "CLIENT" ? "received from" : "paid to"}{" "}
                    {entityName}, dated{" "}
                    {mergePreview.date && mergePreview.date.length >= 10
                      ? mergePreview.date.slice(0, 10)
                      : mergePreview.displayDate ?? "—"}
                    .
                  </Text>
                  <Text style={styles.mergeWillLine}>
                    • Tied to trip{" "}
                    {missionLabelForTripRef?.(mergePreview.tripRef) ??
                      mergePreview.tripRef.toUpperCase()}
                    .
                  </Text>
                  <Text style={styles.mergeWillLine}>
                    • Note on the entry will say it came from shared ledger sync.
                  </Text>
                </View>
              </>
            ) : null}
          </ScrollView>
          <View
            style={[
              styles.mergeModalFooter,
              { paddingBottom: 12 + insets.bottom },
            ]}
          >
            <View style={styles.mergeModalFooterInner}>
              <TouchableOpacity
                style={styles.mergeCancelBtn}
                onPress={() => setMergePreview(null)}
                disabled={mergeSubmitting}
              >
                <Text style={styles.mergeCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.mergeConfirmBtn,
                  (mergeSubmitting || actionLoading) && styles.mergeConfirmBtnDisabled,
                ]}
                onPress={() => void confirmMergePartner()}
                disabled={mergeSubmitting || actionLoading}
              >
                <Text style={styles.mergeConfirmBtnTxt}>
                  {mergeSubmitting
                    ? "Updating…"
                    : mergePreview?.hasLocalTrip === false
                      ? "Adopt Trip & Finalize"
                      : "Accept Payment Update"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function shortIdForDisplay(raw: string): string {
  const s = (raw ?? "").trim();
  if (s.length <= 14) return s || "—";
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function MergeRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[mergeRowStyles.row, last && mergeRowStyles.rowLast]}>
      <Text style={mergeRowStyles.lbl}>{label}</Text>
      <Text style={mergeRowStyles.val} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const mergeRowStyles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  lbl: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  val: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FAFBFF",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 120,
    paddingHorizontal: 16,
    paddingTop: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heroHeaderSpacer: { width: 44 },
  heroHeaderCenter: { flex: 1, alignItems: "center", minWidth: 0 },
  heroEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    maxWidth: "100%",
    paddingHorizontal: 4,
  },
  heroEntityTextCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  heroEntityTitle: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  heroEntitySub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.6,
  },
  heroDlBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  mainTabs: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 22,
    padding: 4,
    marginBottom: 16,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 18,
    alignItems: "center",
  },
  mainTabOn: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  mainTabTxt: { fontSize: 11, fontWeight: "900", color: "#64748B" },
  mainTabTxtOn: { color: "#0F172A" },
  restricted: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  restrictedTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
  },
  restrictedSub: { fontSize: 12, color: Theme.textMuted, textAlign: "center" },
  sharedCore: { gap: 12, width: "100%", alignSelf: "stretch" },
  pendingInboxWrap: { gap: 8, marginBottom: 2 },
  /** Three compact cards per row (50%-scaled tiles). */
  pendingInboxGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    width: "100%",
    rowGap: 8,
  },
  pendingCardWrap: {
    width: "31%",
    flexGrow: 0,
    minWidth: 0,
    marginRight: "3.5%",
    marginBottom: 0,
  },
  pendingCardWrapMobile: {
    width: "100%",
    marginRight: 0,
    marginBottom: 8,
  },
  pendingCardWrapRowEnd: {
    marginRight: 0,
  },
  pendingInboxHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  pendingInboxTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  pendingInboxBadge: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pendingInboxBadgeTxt: {
    fontSize: 6,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  pendingCard: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    padding: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  pendingCardGlow: {
    position: "absolute",
    top: -22,
    right: -18,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Theme.aggregatePillBg,
  },
  pendingCardTop: {
    flexDirection: "column",
    alignItems: "stretch",
    marginBottom: 5,
    zIndex: 1,
    gap: 4,
  },
  pendingMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    width: "100%",
  },
  pendingMainCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pendingCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  pendingPartyNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  pendingRefPill: {
    maxWidth: "52%",
    flexShrink: 1,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pendingRefPillTxt: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textSecondary,
    ...(Platform.OS === "web" ? { fontFamily: "monospace" } : {}),
  },
  pendingHeroAmount: {
    fontSize: 17,
    fontWeight: "800",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    letterSpacing: -0.35,
    maxWidth: "44%",
    flexShrink: 0,
    lineHeight: 20,
  },
  pendingTripDetailLine: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  pendingTripDetailMuted: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  pendingBookBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  pendingBookBadgeOk: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  pendingBookBadgeGhost: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.warning,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  pendingPartyName: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pendingRouteHint: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    marginTop: 2,
    lineHeight: 12,
  },
  pendingActionRow: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    zIndex: 1,
    gap: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  pendingActionHint: {
    color: Theme.textSecondary,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.15,
    lineHeight: 12,
  },
  pendingActionBtn: {
    backgroundColor: Theme.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  pendingActionBtnTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compareToggle: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  compareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 16,
    minWidth: 0,
  },
  compareBtnOn: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  compareBtnTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  compareBtnTxtOn: { color: Theme.textPrimaryDark, fontWeight: "600" },
  compareCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
  },
  compareCountOn: { backgroundColor: Theme.aggregatePillBg },
  compareCountTxt: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  compareCountTxtOn: { color: Theme.aggregatePillText },
  toolbarSingleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    marginBottom: 4,
  },
  layoutToggle: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    padding: 3,
  },
  layoutBtn: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  layoutBtnOn: {
    backgroundColor: Theme.surface,
  },
  chipScrollView: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 2,
  },
  chipScrollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    marginRight: 6,
  },
  chipOn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipTxt: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  chipTxtOn: { color: Theme.textOnPrimary },
  chipCnt: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    opacity: 0.85,
  },
  chipCntOn: { color: Theme.textOnPrimary, opacity: 0.85 },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  gridTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  gridBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  gridBadgeTxt: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.35,
  },
  missionCard: {
    position: "relative" as const,
    backgroundColor: Theme.screenBackground,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 5,
  },
  /** Web reference: thin status strip at top of hub trip / payment cards. */
  hubCardAccentBar: {
    width: "100%",
    height: 5,
    zIndex: 4,
  },
  hubCardAccentRose: { backgroundColor: Theme.teslaRed },
  hubCardAccentWarn: { backgroundColor: Theme.warning },
  hubCardAccentGood: { backgroundColor: Theme.darkGreen },
  hubCardAccentSlate: { backgroundColor: Theme.textSection },
  hubCardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  hubTxnIconWrap: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
  },
  /** Animated truck / link watermark — sits under header + mirror (see `SlgCardWatermark`). */
  missionCardWatermarkShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
  },
  missionCardWatermarkInner: {
    position: "absolute",
    right: -28,
    top: "14%",
    alignItems: "center",
    justifyContent: "center",
  },
  tripGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    gap: 8,
    alignContent: "flex-start",
  },
  tripGridWrapMobile: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignContent: "flex-start",
  },
  tripGridCell: {
    width: "32%",
    minWidth: 0,
  },
  /** Narrow phone / web: one card per row so mirror columns stay legible. */
  tripGridCellFull: {
    width: "100%",
    flexBasis: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  /** Small tablet / large phone: two-up grid (`flexBasis: 0` + `gap` avoids row overflow). */
  tripGridCellHalf: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: "42%",
    maxWidth: "50%",
  },
  /** Wide handheld / small tablet: three-up (tight). */
  tripGridCellThird: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: "28%",
    maxWidth: "34%",
  },
  /** “Smart audit” table (reference: dark header, partner column, icon audit). */
  auditTableCard: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 2,
  },
  /** Fills the padded scroll column; inner table then uses 100% width (no fixed 720px cap). */
  auditTableHScroll: {
    width: "100%",
    alignSelf: "stretch",
  },
  auditTableHScrollContent: {
    flexGrow: 1,
    alignItems: "stretch",
    minWidth: "100%",
  },
  auditTableInner: {
    flexDirection: "column",
    width: "100%",
    alignSelf: "stretch",
    minWidth: 520,
  },
  auditThead: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  auditTh: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Theme.surfaceBorder,
  },
  auditThId: {
    width: 172,
    minWidth: 172,
  },
  auditThMy: {
    flex: 1,
    minWidth: 112,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  auditThPartner: {
    flex: 1,
    minWidth: 112,
  },
  auditThDelta: {
    width: 102,
    minWidth: 96,
    alignItems: "center",
  },
  auditThAudit: {
    width: 80,
    minWidth: 80,
    alignItems: "center",
    borderRightWidth: 0,
  },
  auditThTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  auditThTxtCenter: {
    textAlign: "center",
    width: "100%",
  },
  auditRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  /** Trips table: equal row height + vertically centered content; tabular columns right-aligned. */
  auditRowFleet: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
  },
  auditCellId: {
    width: 172,
    minWidth: 172,
    paddingVertical: 12,
    paddingHorizontal: 10,
    paddingLeft: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    justifyContent: "center",
    position: "relative",
  },
  auditConflictBar: {
    position: "absolute",
    left: 0,
    top: 5,
    bottom: 5,
    width: 4,
    backgroundColor: Theme.teslaRed,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  auditIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  auditIdIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  auditIdIconRose: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.negativeMuted,
  },
  auditIdTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  auditIdTitle: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  auditIdMeta: {
    marginTop: 1,
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    lineHeight: 10,
    textTransform: "uppercase",
  },
  auditCellMy: {
    flex: 1,
    minWidth: 112,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    justifyContent: "center",
  },
  auditCellMyBody: {
    backgroundColor: "rgba(248,250,252,0.95)",
  },
  auditAmtMain: {
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  auditAmtSub: {
    marginTop: 8,
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontStyle: "italic",
  },
  auditCellPartner: {
    flex: 1,
    minWidth: 112,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  auditCellPartnerDark: {
    backgroundColor: "#0F172A",
  },
  auditCellPartnerWait: {
    backgroundColor: Theme.surfaceLight,
    marginVertical: 8,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderStyle: "dashed",
  },
  auditAmtOnDark: {
    color: "#FFFFFF",
  },
  auditPartnerSub: {
    marginTop: 8,
    fontSize: 9,
    fontWeight: "900",
    color: "#A5B4FC",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontStyle: "italic",
  },
  auditPartnerWaitTxt: {
    color: Theme.textMuted,
    fontStyle: "italic",
    fontSize: 14,
    fontWeight: "800",
  },
  auditCellDelta: {
    width: 102,
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  auditCellDeltaBody: {
    backgroundColor: "rgba(241,245,249,0.85)",
  },
  auditDeltaPlaceholder: {
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textMuted,
    textAlign: "center",
  },
  auditDeltaHint: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 13,
  },
  auditDeltaKind: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  auditDeltaZero: {
    color: Theme.darkGreen,
    textAlign: "center",
  },
  auditDeltaNonZero: {
    color: Theme.teslaRed,
    textAlign: "center",
  },
  auditCellAudit: {
    width: 80,
    minWidth: 80,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  auditIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  auditIconWrapRose: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
  },
  auditIconWrapGreen: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  auditIconWrapMuted: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.borderLight,
  },
  auditIconWrapAmber: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
  },
  auditAuditLblRose: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.teslaRed,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  auditAuditLblGreen: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  auditAuditLblMuted: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  auditAuditLblAmber: {
    fontSize: 9,
    fontWeight: "900",
    color: "#D97706",
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  auditTableFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: "rgba(248,250,252,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  auditFooterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.darkGreen,
  },
  auditFooterTxt: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    fontStyle: "italic",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  /** Hub “dual-truth” table (reference: Record / Billed / Verified / Sync). */
  hubDualThBilled: {
    flex: 1.35,
    minWidth: 132,
    alignItems: "center",
  },
  hubDualThVerified: {
    width: 138,
    minWidth: 128,
    alignItems: "center",
  },
  hubDualThSync: {
    width: 76,
    minWidth: 72,
    alignItems: "center",
    borderRightWidth: 0,
  },
  hubDualThSub: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
    opacity: 0.9,
  },
  hubDualThTitleCenter: {
    textAlign: "center",
  },
  hubDualCellBilled: {
    flex: 1.35,
    minWidth: 132,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.95)",
  },
  hubDualCellBilledWarn: {
    backgroundColor: "rgba(255,241,242,0.65)",
  },
  hubDualYouLine: {
    fontSize: 12,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -0.35,
  },
  hubDualTheyLine: {
    marginTop: 5,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  hubDualTheyLineWarn: {
    color: Theme.teslaRed,
  },
  hubDualCellVerified: {
    width: 138,
    minWidth: 128,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  hubDualCellVerifiedWarn: {
    backgroundColor: Theme.warningMuted,
  },
  /** Primary line in Payment column — Trips hub table amount typography. */
  hubDualVerifiedYouLine: {
    fontSize: 12,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -0.35,
  },
  /** Partner line in Payment column — matches billed “They say” semantics. */
  hubDualVerifiedTheyLine: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },
  hubDualVerifiedTheyLineWarn: {
    color: Theme.teslaRed,
  },
  hubDualCellSync: {
    width: 76,
    minWidth: 72,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  hubDualSyncIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  hubDualSyncIconOk: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  hubDualSyncIconBad: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
  },
  hubDualSyncLbl: {
    fontSize: 7,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hubDualSyncLblOk: { color: Theme.darkGreen },
  hubDualSyncLblBad: { color: Theme.teslaRed, fontStyle: "italic" },
  /** Flex + minWidth: extra table width flows into mission / route / partner (responsive). */
  fleetThMission: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 156,
    alignItems: "flex-start",
  },
  fleetThRoute: {
    flexGrow: 2.35,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 204,
    alignItems: "flex-start",
  },
  fleetThPartner: {
    flexGrow: 2.15,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 196,
    alignItems: "flex-start",
  },
  /** Money + count headers: right-align with column body (ledger); fixed width — no flex. */
  fleetThMoney: {
    width: 100,
    minWidth: 96,
    maxWidth: 100,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  fleetThMetaTxn: {
    width: 56,
    minWidth: 52,
    maxWidth: 56,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  fleetThMetaLast: {
    width: 84,
    minWidth: 76,
    maxWidth: 84,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
  },
  fleetThSync: {
    width: 52,
    minWidth: 48,
    maxWidth: 52,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    borderRightWidth: 0,
  },
  fleetThTxtTab: {
    textAlign: "right",
    width: "100%",
  },
  fleetCellMission: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 156,
    paddingVertical: 9,
    paddingHorizontal: 10,
    paddingLeft: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderMedium,
    justifyContent: "center",
    position: "relative",
  },
  fleetCellRoute: {
    flexGrow: 2.35,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 204,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderMedium,
    justifyContent: "center",
    alignItems: "flex-start",
    backgroundColor: Theme.surface,
  },
  fleetRouteText: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 14,
    textAlign: "left",
    width: "100%",
  },
  fleetCellPartner: {
    flexGrow: 2.15,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 196,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderMedium,
    justifyContent: "center",
    alignItems: "stretch",
  },
  fleetPartnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  fleetPartnerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  fleetPartnerName: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 14,
  },
  fleetPartnerSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 11,
  },
  fleetCellMoney: {
    width: 100,
    minWidth: 96,
    maxWidth: 100,
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 9,
    paddingHorizontal: 10,
    paddingLeft: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderMedium,
    justifyContent: "center",
    alignItems: "stretch",
  },
  fleetMoneyCol: {
    width: "100%",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  fleetMoneyVal: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontStyle: "normal",
    textAlign: "right",
    letterSpacing: -0.1,
    width: "100%",
  },
  fleetMoneyGood: { color: Theme.darkGreen },
  fleetMoneyDue: {
    color: Theme.teslaRed,
    fontWeight: "700",
    fontStyle: "normal",
  },
  fleetMoneySub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
    lineHeight: 11,
    width: "100%",
    letterSpacing: 0.15,
  },
  fleetMoneySubWarn: { color: Theme.teslaRed },
  /** Invisible second line — matches Sales/Received subline height so Due/Txns columns align. */
  fleetMoneySubSpacer: {
    marginTop: 2,
    fontSize: 7,
    lineHeight: 10,
    fontWeight: "500",
    color: "transparent",
    textAlign: "right",
    width: "100%",
  },
  fleetMoneySubSpacerCenter: {
    marginTop: 2,
    fontSize: 7,
    lineHeight: 10,
    fontWeight: "500",
    color: "transparent",
    textAlign: "center",
    width: "100%",
  },
  fleetCellMetaTxn: {
    width: 56,
    minWidth: 52,
    maxWidth: 56,
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderMedium,
    justifyContent: "center",
    alignItems: "stretch",
  },
  fleetCellMetaLast: {
    width: 84,
    minWidth: 76,
    maxWidth: 84,
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderMedium,
    justifyContent: "center",
    alignItems: "stretch",
  },
  fleetMetaColRight: {
    width: "100%",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  fleetMetaColCenter: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  fleetMetaValTab: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    lineHeight: 12,
    width: "100%",
    fontVariant: ["tabular-nums"],
  },
  fleetMetaValDate: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 12,
    width: "100%",
    letterSpacing: 0.2,
  },
  fleetCellSync: {
    width: 52,
    minWidth: 48,
    maxWidth: 52,
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 9,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  fleetSyncIcon: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  fleetSyncIconOk: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  fleetSyncIconBad: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
  },
  fleetSyncLabel: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fleetSyncLabelOk: {
    color: Theme.darkGreen,
  },
  fleetSyncLabelBad: {
    color: Theme.teslaRed,
    fontStyle: "italic",
  },
  /** Trip detail “dashboard” (reference: dark hero + payment table). */
  tripDashHero: {
    borderRadius: 32,
    backgroundColor: "#0F172A",
    padding: 20,
    overflow: "hidden",
    marginBottom: 16,
  },
  tripDashHeroGlow: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.08)",
    opacity: 0.9,
  },
  tripDashHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  tripDashPartnerStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tripDashPartnerStripName: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tripDashHeroTag: { flexDirection: "row", alignItems: "center", gap: 8 },
  tripDashTagTxt: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontStyle: "italic",
  },
  tripDashStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  tripDashStatusPillOk: {
    backgroundColor: "rgba(21,128,61,0.18)",
    borderColor: "rgba(21,128,61,0.45)",
  },
  tripDashStatusPillBad: {
    backgroundColor: "rgba(232,33,39,0.14)",
    borderColor: "rgba(232,33,39,0.45)",
  },
  tripDashStatusTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnDark,
    textTransform: "uppercase",
  },
  tripDashStatusTxtOk: {
    color: Theme.positiveMuted,
  },
  tripDashStatusTxtBad: {
    color: Theme.teslaRed,
  },
  tripDashBlock: { marginBottom: 18 },
  tripDashBlockHdr: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  tripDashBlockHdrLblFull: {
    fontSize: 9,
    fontWeight: "900",
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontStyle: "italic",
    textAlign: "center",
  },
  tripDashPartnerSubDelta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "900",
    color: Theme.teslaRed,
    fontStyle: "italic",
    textAlign: "right",
  },
  tripDashGrid2: {
    flexDirection: "row",
    gap: 16,
  },
  tripDashColRight: {
    flex: 1,
    alignItems: "flex-end",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.08)",
    paddingLeft: 12,
  },
  tripDashMicro: {
    fontSize: 8,
    fontWeight: "900",
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  tripDashMicroPartner: {
    fontSize: 8,
    fontWeight: "900",
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
    textAlign: "right",
  },
  tripDashBig: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    fontStyle: "italic",
  },
  tripDashBigPartner: {
    fontSize: 22,
    fontWeight: "900",
    color: "rgba(248,250,252,0.92)",
    fontStyle: "italic",
    textAlign: "right",
  },
  tripDashTableCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    overflow: "hidden",
    marginBottom: 24,
  },
  tripDashTableHead: {
    flexDirection: "row",
    backgroundColor: "#0F172A",
    alignItems: "stretch",
  },
  tripDashTh: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 9,
    fontWeight: "900",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontStyle: "italic",
    textAlign: "left",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(255,255,255,0.08)",
  },
  tripDashThTxnCol: { flex: 1.35, minWidth: 108 },
  tripDashThPartnerCol: { flex: 1, minWidth: 88 },
  tripDashThLast: {
    borderRightWidth: 0,
    width: 72,
    flex: 0,
    textAlign: "center",
  },
  tripDashThMine: { backgroundColor: "rgba(255,255,255,0.05)" },
  tripDashTr: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripDashTd: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    justifyContent: "flex-start",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  tripDashTdTxn: { flex: 1.35, minWidth: 108, alignItems: "flex-start" },
  tripDashTdMine: {
    backgroundColor: "rgba(248,250,252,0.95)",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
  },
  tripDashTdPartner: {
    alignItems: "flex-start",
    flex: 1,
    minWidth: 88,
    justifyContent: "center",
  },
  tripDashTdPartnerDark: { backgroundColor: "#0F172A" },
  tripDashTdPartnerWarn: { backgroundColor: "rgba(255,241,242,0.5)" },
  tripDashTdSync: {
    width: 72,
    flex: 0,
    alignItems: "center",
    borderRightWidth: 0,
  },
  tripDashTxnTitle: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "left",
  },
  tripDashTxnDate: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tripDashAmtMine: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textAlign: "left",
    width: "100%",
  },
  tripDashAmtPartner: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
    fontStyle: "italic",
    textAlign: "left",
    width: "100%",
  },
  tripDashAmtPartnerBad: { color: Theme.teslaRed },
  tripDashAmtPartnerPending: {
    fontSize: 12,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.teslaRed,
    textAlign: "left",
    width: "100%",
  },
  tripDashTxnRef: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tripDetailPhoneBtn: {
    padding: 10,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tripDashCheckWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tripDashCheckOk: {
    backgroundColor: "rgba(220,252,231,0.95)",
    borderColor: "rgba(34,197,94,0.25)",
  },
  tripDashCheckBad: {
    backgroundColor: "rgba(255,241,242,0.95)",
    borderColor: "rgba(244,63,94,0.25)",
  },
  missionTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  missionCardSummary: {
    marginTop: 0,
    fontSize: SLG_FS_LABEL,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  missionCardSummaryDesktop: {
    fontSize: SLG_FS_CAPTION,
    lineHeight: 12,
  },
  /** Same shell as Trips hub `fleetManifest` — route reads as the card “hero”. */
  missionRouteManifest: {
    marginTop: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  missionRouteLine: {
    marginTop: 0,
    fontSize: SLG_FS_ROUTE_HERO,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 15,
  },
  missionStatusBadge: {
    textTransform: "none",
    fontWeight: "600",
    fontSize: 9,
    letterSpacing: 0.15,
  },
  /** Payment grid card date line (matches trip card `tripRowTripDate`). */
  txnGridDateLine: {
    marginTop: 2,
    fontSize: SLG_FS_LABEL,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textSecondary,
  },
  txnCardGrid: {
    marginBottom: 0,
    width: "100%",
  },
  missionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 2,
  },
  missionHeadLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  missionEntityRow: {
    width: "100%",
    marginBottom: 2,
  },
  missionPartnerLineInline: {
    fontSize: SLG_FS_CAPTION,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  slgPartyAvatarBorder: {
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  slgPartyAvatarInitialsTxt: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  missionIdRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    rowGap: 4,
  },
  missionId: {
    fontSize: SLG_FS_AMOUNT,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  /** Command hub grid: bolder mission / trip title (reference “2xl black italic”). */
  missionIdHero: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.35,
  },
  missionChevronWrap: {
    marginLeft: 4,
    paddingTop: 2,
    paddingLeft: 4,
    justifyContent: "flex-start",
    alignSelf: "flex-start",
  },
  missionBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeGreen: { color: Theme.darkGreen, backgroundColor: Theme.positiveMuted, borderWidth: 1, borderColor: Theme.darkGreen },
  badgeRed: { color: Theme.teslaRed, backgroundColor: Theme.negativeMuted, borderWidth: 1, borderColor: Theme.teslaRed },
  /** Pending / neutral — slate only (no violet). */
  badgeNeutral: {
    color: Theme.textSecondary,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  badgeGray: { color: Theme.textSecondary, backgroundColor: Theme.surfaceLight, borderWidth: 1, borderColor: Theme.borderMedium },
  deltaTxtInline: {
    fontSize: SLG_FS_LABEL,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.teslaRed,
  },
  mirrorBlock: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    alignItems: "center",
    zIndex: 2,
  },
  /** Billed trip amount per book (vs “Paid” row below). */
  mirrorSaleCaption: {
    textAlign: "left",
    fontSize: SLG_FS_AMOUNT_LABEL,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
    alignSelf: "stretch",
    width: "100%",
  },
  mirrorColumnsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: SLG_MIRROR_GAP,
    minWidth: 0,
    alignSelf: "center",
    width: "100%",
    maxWidth: 288,
  },
  mirrorMy: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "flex-start",
    justifyContent: "center",
    minWidth: 0,
    minHeight: 52,
  },
  mirrorMyHub: {
    backgroundColor: Theme.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 54,
    alignItems: "center",
  },
  mirrorPartner: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "flex-end",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    minWidth: 0,
    minHeight: 52,
  },
  mirrorPartnerHubDark: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 54,
    alignItems: "center",
  },
  mirrorPartnerWait: {
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.borderMedium,
  },
  hubMirrorLblOnDark: {
    color: Theme.ledgerPartnerLabelOnDark,
  },
  mirrorLbl: {
    fontSize: SLG_FS_AMOUNT_LABEL,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
    letterSpacing: 0.4,
    width: "100%",
  },
  mirrorLblPartner: {
    textAlign: "right",
  },
  mirrorLblHub: {
    textAlign: "center",
    width: "100%",
  },
  mirrorAmt: {
    fontSize: SLG_FS_BODY,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.25,
    textAlign: "left",
    width: "100%",
  },
  mirrorAmtPartner: {
    textAlign: "right",
  },
  mirrorAmtHub: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.35,
    width: "100%",
  },
  waitTxt: {
    color: Theme.textMuted,
    fontStyle: "normal",
    fontWeight: "600",
    fontSize: SLG_FS_LABEL,
    textAlign: "left",
  },
  waitTxtPartner: {
    textAlign: "right",
  },
  bridge: {
    width: SLG_BRIDGE_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingVertical: 2,
  },
  bridgeInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  paidRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    marginTop: 0,
    width: "100%",
    alignSelf: "stretch",
    zIndex: 2,
  },
  paidColumnsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minWidth: 0,
    alignSelf: "center",
    width: "100%",
    maxWidth: 288,
  },
  /** Same width as `mirrorColumnsRow` middle (gaps + bridge) so Paid lines up under sale boxes. */
  bridgeTrackSpacer: {
    width: SLG_MIRROR_BRIDGE_TRACK,
    flexShrink: 0,
  },
  paidCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  paidCellRight: { alignItems: "flex-end" },
  paidLbl: {
    fontSize: SLG_FS_AMOUNT_LABEL,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    width: "100%",
  },
  paidAmt: {
    fontSize: SLG_FS_BODY,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginTop: 2,
    letterSpacing: -0.25,
    width: "100%",
  },
  paidTxtRight: {
    textAlign: "right",
  },
  empty: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyTxt: { fontSize: 12, fontWeight: "600", fontStyle: "italic", color: Theme.textMuted },
  /** Base shell; positioning + minHeight on web come from detailShellLayoutStyle. */
  subScreen: { backgroundColor: "#FAFBFF", zIndex: 50 },
  /** Web: fill the minHeight shell so inner content scrolls instead of collapsing. */
  detailScrollWeb: { flex: 1 },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  subBack: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  subHeaderCenter: { flex: 1, alignItems: "center" },
  subTitle: { fontSize: 16, fontWeight: "900", color: Theme.textPrimaryDark, fontStyle: "italic" },
  subSub: { fontSize: 9, fontWeight: "800", color: Theme.textMuted, letterSpacing: 1.2, marginTop: 2 },
  subTitleForensic: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  subSubForensic: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  forensicRefTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    fontStyle: "italic",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  forensicRefSub: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    marginTop: 4,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontStyle: "italic",
  },
  subScroll: { padding: 16, paddingBottom: 120 },
  subScrollForensic: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  detailHero: {
    backgroundColor: "#0F172A",
    borderRadius: 28,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  detailHeroRoseGlow: {
    position: "absolute",
    top: -48,
    right: -48,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  detailHeroBlur: { ...StyleSheet.absoluteFillObject },
  detailHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    zIndex: 1,
  },
  detailHeroLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailActive: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
    letterSpacing: 2,
  },
  detailVarBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(245,158,11,0.2)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
  },
  detailVarBadgeTxt: { fontSize: 10, fontWeight: "900", color: "#FBBF24" },
  detailHeroGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 1,
  },
  detailLbl: { fontSize: 10, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase" },
  detailLblPartner: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    textAlign: "right",
  },
  detailAmt: { fontSize: 24, fontWeight: "900", color: "#FFF", marginTop: 6, fontStyle: "italic" },
  detailRightCol: { alignItems: "flex-end" },
  detailDeltaRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 1,
  },
  detailDeltaLbl: { fontSize: 13, fontWeight: "700", color: "#94A3B8", fontStyle: "italic" },
  detailDeltaVal: { fontSize: 22, fontWeight: "900", color: "#F87171", fontStyle: "italic" },
  detailTripChargeFootnote: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    lineHeight: 16,
    zIndex: 1,
  },
  detailPaymentRollup: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  detailPaymentRollupTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  detailPaymentRollupBody: {
    fontSize: 13,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  detailPaymentRollupEm: {
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  detailPaymentRollupAwait: {
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  detailPaymentRollupHint: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  tripDashAdjustBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripDashAdjustIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripDashAdjustBody: { flex: 1, minWidth: 0 },
  tripDashAdjustTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  tripDashAdjustSub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  tripDashAdjustList: { marginTop: 8, gap: 6 },
  tripDashAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripDashAdjustReason: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minWidth: 0,
  },
  tripDashAdjustAmt: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 0,
  },
  tripDashLineKindPill: {
    alignSelf: "flex-end",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(79,70,229,0.12)",
    borderWidth: 1,
    borderColor: "rgba(79,70,229,0.28)",
  },
  tripDashLineKindTxt: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  bridgeSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 4,
  },
  bridgeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  bridgeTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.4,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  bridgeList: { gap: 0 },
  bridgeEmptyHint: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  bridgeEmptyHintTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  bridgeBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  bridgeBadgeTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSecondary,
  },
  bridgeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 8,
  },
  bridgeCardId: { flex: 1, fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  bridgeCardAmt: { fontSize: 13, fontWeight: "900", color: Theme.textPrimaryDark },
  txnBridgeCard: {
    position: "relative",
    marginBottom: 16,
    borderRadius: 28,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 2,
  },
  txnBridgeStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  txnBridgeInner: { paddingLeft: 14, paddingVertical: 18, paddingRight: 16 },
  txnBridgeTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  txnBridgeHeadLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  txnBridgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  txnBridgeIdLbl: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  txnBridgeEntryTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    marginTop: 4,
  },
  txnBridgeStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: "42%",
  },
  txnBridgeStatusOk: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  txnBridgeStatusBad: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
  },
  txnBridgeStatusTxt: { fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  txnBridgeStatusTxtOk: { color: Theme.darkGreen },
  txnBridgeStatusTxtBad: { color: Theme.teslaRed },
  txnBridgeMirror: {
    flexDirection: "row",
    gap: 8,
    position: "relative",
    minHeight: 92,
    alignItems: "stretch",
  },
  txnBridgeMine: {
    flex: 1,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    justifyContent: "center",
  },
  txnBridgePartner: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  txnBridgeMirrorLbl: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  txnBridgeMirrorLblPartner: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  txnBridgeMirrorAmt: {
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  txnBridgeMirrorAmtPartner: { fontSize: 15, fontWeight: "900", color: "#FFFFFF" },
  txnBridgePartnerPlaceholder: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textAlign: "center",
  },
  txnBridgeCenterIcon: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -16,
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 2,
  },
  forensicEntryTable: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    backgroundColor: Theme.surface,
    marginBottom: 8,
  },
  forensicEntryHead: {
    flexDirection: "row",
    backgroundColor: "#0F172A",
    alignItems: "stretch",
  },
  forensicEntryTh: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: "900",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontStyle: "italic",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(255,255,255,0.08)",
  },
  forensicEntryThDetail: { flex: 1.15, minWidth: 88 },
  forensicEntryThMine: { backgroundColor: "rgba(255,255,255,0.06)" },
  forensicEntryThSync: {
    width: 56,
    flex: 0,
    textAlign: "center",
    borderRightWidth: 0,
  },
  forensicEntryRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  forensicEntryRowLast: { borderBottomWidth: 0 },
  forensicEntryTd: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  forensicEntryTdDetail: { flex: 1.15, minWidth: 88 },
  forensicEntryTdMine: {
    backgroundColor: "rgba(248,250,252,0.95)",
  },
  forensicEntryTdPartnerWarn: { backgroundColor: "rgba(255,241,242,0.45)" },
  forensicEntryTdSync: {
    width: 56,
    flex: 0,
    alignItems: "center",
    borderRightWidth: 0,
  },
  forensicEntryDetailLbl: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  forensicEntryMineVal: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
  },
  forensicEntryPartnerVal: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
  },
  forensicEntryPartnerValBad: { color: Theme.teslaRed },
  forensicDiagCard: {
    borderRadius: 32,
    backgroundColor: "#0F172A",
    marginBottom: 20,
    overflow: "hidden",
  },
  forensicDiagCardAligned: {
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.35)",
  },
  forensicDiagGlow: {
    position: "absolute",
    top: -32,
    right: -32,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(244, 63, 94, 0.35)",
  },
  forensicDiagGlowAligned: {
    backgroundColor: "rgba(52, 211, 153, 0.2)",
  },
  forensicDiagInner: { padding: 20, zIndex: 1 },
  forensicDiagBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(244, 63, 94, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.35)",
    marginBottom: 12,
  },
  forensicDiagBadgeTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FCA5A5",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  forensicDiagBadgeAligned: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    borderColor: "rgba(52, 211, 153, 0.4)",
  },
  forensicDiagBadgeTxtAligned: { color: "#6EE7B7" },
  forensicDiagBody: {
    fontSize: 14,
    fontWeight: "600",
    color: "#CBD5E1",
    fontStyle: "italic",
    lineHeight: 22,
  },
  forensicDiagAmt: {
    color: "#FB7185",
    fontWeight: "900",
    fontStyle: "italic",
  },
  forensicDiagEm: {
    color: "#FFFFFF",
    fontWeight: "900",
    textDecorationLine: "underline",
    textDecorationColor: "#FB7185",
  },
  forensicMirrorHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  forensicMirrorHeaderLbl: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontStyle: "italic",
  },
  forensicSyncBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  forensicSyncBadgeTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "capitalize",
  },
  forensicTable: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  forensicTableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Theme.borderLight },
  forensicTableHeadCell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: "rgba(248, 250, 252, 0.9)",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
  },
  forensicTableHeadDark: {
    backgroundColor: "#0F172A",
    borderRightWidth: 0,
  },
  forensicTableHeadTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  forensicTableHeadTxtDark: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  forensicRow: {
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 14,
    paddingTop: 6,
  },
  forensicRowLast: { borderBottomWidth: 0 },
  forensicPillWrap: { alignItems: "center", marginBottom: -10, zIndex: 2 },
  forensicPillInner: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  forensicPillTxt: { fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  forensicPillTxtOk: { color: Theme.darkGreen },
  forensicPillTxtBad: { color: Theme.teslaRed },
  forensicPillOk: { backgroundColor: Theme.positiveMuted, borderColor: Theme.darkGreen },
  forensicPillBad: { backgroundColor: Theme.negativeMuted, borderColor: Theme.teslaRed },
  forensicGrid: { flexDirection: "row", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: Theme.borderLight },
  forensicCell: { flex: 1, padding: 16, alignItems: "center", backgroundColor: Theme.surfaceLight },
  forensicCellDark: { backgroundColor: "#0F172A" },
  forensicCellWarn: { backgroundColor: "rgba(244,63,94,0.08)" },
  forensicLbl: { fontSize: 9, fontWeight: "900", color: Theme.textMuted, marginBottom: 6 },
  forensicLblDark: { color: "#94A3B8" },
  forensicLblWarn: { color: "#94A3B8" },
  forensicVal: { fontSize: 15, fontWeight: "900", color: Theme.textPrimaryDark, fontStyle: "italic" },
  forensicValDark: { color: "#FFFFFF" },
  forensicValBad: { color: Theme.teslaRed },
  fabBar: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  fabUse: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0F172A",
    paddingVertical: 14,
    borderRadius: 20,
  },
  fabUseTxt: { color: "#FFF", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  fabDispute: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E11D48",
    paddingVertical: 14,
    borderRadius: 20,
  },
  fabDisputeTxt: { color: "#FFF", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  mergeModalRoot: {
    flex: 1,
    backgroundColor: "#FAFBFF",
  },
  mergeModalScroll: {
    flex: 1,
  },
  mergeModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "#FAFBFF",
  },
  mergeModalCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  mergeModalHeaderCenter: { flex: 1, alignItems: "center" },
  mergeModalHeaderTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  mergeModalHeaderSub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "900",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontStyle: "italic",
  },
  mergeModalBody: {
    paddingTop: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    flexGrow: 1,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  mergeGhostNotice: {
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  mergeGhostNoticeTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  mergeGhostNoticeText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "#B45309",
    lineHeight: 16,
  },
  mergeHeroBlock: {
    alignItems: "center",
    marginBottom: Layout.sectionSpacing,
    paddingBottom: 4,
  },
  mergeBadge: {
    alignSelf: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 14,
  },
  mergeBadgeTxt: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  mergeHeroAmt: {
    fontSize: 44,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
    fontStyle: "italic",
  },
  mergePartyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    width: "100%",
  },
  mergeParty: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textMuted,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  mergeRoute: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  mergeSectionTitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    alignSelf: "stretch",
  },
  mergeSectionTitleAfterCard: {
    marginTop: 22,
  },
  mergeDetailCard: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignSelf: "stretch",
    overflow: "hidden",
    marginBottom: 6,
  },
  mergeWillCard: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
    alignSelf: "stretch",
  },
  mergeWillLine: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  mergeModalFooter: {
    paddingTop: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: "#FAFBFF",
  },
  mergeModalFooterInner: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  mergeCancelBtn: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  mergeCancelBtnTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  mergeConfirmBtn: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  mergeConfirmBtnDisabled: { opacity: 0.65 },
  mergeConfirmBtnTxt: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});

function HubDualSyncCell({ safe }: { safe: boolean }) {
  return (
    <View style={styles.hubDualCellSync}>
      <View
        style={[
          styles.hubDualSyncIcon,
          safe ? styles.hubDualSyncIconOk : styles.hubDualSyncIconBad,
        ]}
      >
        {safe ? (
          <CheckCircle2 size={18} color={Theme.darkGreen} />
        ) : (
          <Zap
            size={17}
            color={Theme.teslaRed}
            fill={Theme.teslaRed}
            strokeWidth={2}
          />
        )}
      </View>
      <Text
        style={[
          styles.hubDualSyncLbl,
          safe ? styles.hubDualSyncLblOk : styles.hubDualSyncLblBad,
        ]}
      >
        {safe ? "Safe" : "Fix"}
      </Text>
    </View>
  );
}
