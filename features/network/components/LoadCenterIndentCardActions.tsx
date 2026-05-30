/**
 * Footer actions for Load Center hub indent cards (desktop grid).
 *
 * Dense / grid: single row — [status chip] [share] [primary] [pulse?]
 */
import { FontAwesome } from "@expo/vector-icons";
import Theme from "@/constants/Theme";
import { formatINRChip } from "@/lib/format";
import type { IndentRow } from "@/features/indents";
import { BidReceivedHammer } from "@/features/indents";
import { Package, Share2, Zap } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const TESLA_BLACK = "#1A1A1A";
const FOOTER_BORDER = "#e8ecf0";
const ROW_HEIGHT = 32;
const TOOLBAR_STATUS_SLOT_W = 52;
const TOOLBAR_PULSE_SLOT_W = 48;

export type LoadCenterIndentCardActionsLayout = {
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Card footer wrapper — dense mode is a single toolbar row only. */
export function LoadCenterIndentCardFooter({
  dense,
  style,
  children,
}: LoadCenterIndentCardActionsLayout & { children: ReactNode }) {
  return (
    <View style={[styles.footer, dense && styles.footerDense, style]}>
      {children}
    </View>
  );
}

/** Fixed toolbar: status | share | [primary + trailing actions with gap]. */
function GridToolbarRow({
  status,
  share,
  primary,
  pulse,
}: {
  status: ReactNode;
  share: ReactNode;
  primary: ReactNode;
  pulse?: ReactNode | null;
}) {
  return (
    <View style={styles.denseRow}>
      <View style={styles.toolbarStatusSlot}>{status}</View>
      {share}
      <View style={styles.ctaGroup}>
        <View style={styles.primarySlot}>{primary}</View>
        {pulse ? <View style={styles.trailingSlot}>{pulse}</View> : null}
      </View>
    </View>
  );
}

function PrimaryToolbarPlaceholder({ dense }: { dense?: boolean }) {
  return (
    <View
      style={[styles.primaryToolbarPlaceholder, dense && styles.primaryBtnDense]}
    />
  );
}

function InlineActionRow({ children }: { children: ReactNode }) {
  return <View style={styles.inlineRow}>{children}</View>;
}

function ShareIconButton({
  dense,
  onPress,
  label,
}: {
  dense?: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.shareBtn, dense && styles.shareBtnDense]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityLabel={label}
    >
      <Share2 size={dense ? 14 : 18} color={Theme.textMuted} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

function PrimaryButton({
  dense,
  label,
  onPress,
  disabled,
  inline,
}: {
  dense?: boolean;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Flex within a single toolbar row (grid). */
  inline?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.primaryBtn,
        dense && styles.primaryBtnDense,
        inline && styles.primaryBtnInline,
      ]}
      onPress={onPress}
      activeOpacity={0.9}
      disabled={disabled}
    >
      <Text
        style={[styles.primaryBtnText, dense && styles.primaryBtnTextDense]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PulseButton({
  dense,
  onPress,
}: {
  dense?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.pulseBtn, dense && styles.pulseBtnDense]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel="Broadcast indent to Pulse network as story"
    >
      <Zap size={dense ? 10 : 13} color="#fff" fill="#fff" />
      <Text style={[styles.pulseBtnText, dense && styles.pulseBtnTextDense]}>
        Pulse
      </Text>
    </TouchableOpacity>
  );
}

function PendingChip({ dense }: { dense?: boolean }) {
  return (
    <View style={[styles.pendingChip, dense && styles.pendingChipDense]}>
      <Text style={styles.pendingText} numberOfLines={1}>
        Pending
      </Text>
    </View>
  );
}

/** Compact bids / status chip for the toolbar row. */
export function GiveLoadBidChip({
  bidCount,
  isDone,
  isAwardedPendingTrip,
  awardedAmountLabel,
  dense,
}: {
  bidCount: number;
  isDone: boolean;
  isAwardedPendingTrip: boolean;
  awardedAmountLabel?: string | null;
  dense?: boolean;
}) {
  let icon: ReactNode;
  let line1: string;
  let line2: string;

  if (isDone) {
    icon = (
      <FontAwesome name="check-circle" size={dense ? 10 : 12} color={Theme.positive} />
    );
    line1 = "Done";
    line2 = "";
  } else if (isAwardedPendingTrip) {
    icon = (
      <FontAwesome name="trophy" size={dense ? 10 : 12} color={Theme.driverGold} />
    );
    line1 = "Claimed";
    line2 = awardedAmountLabel ? awardedAmountLabel.replace(/\s/g, "") : "";
  } else {
    icon =
      bidCount > 0 ? (
        <BidReceivedHammer visible size={dense ? 10 : 12} />
      ) : (
        <FontAwesome name="gavel" size={dense ? 10 : 12} color={Theme.textMuted} />
      );
    line1 = String(bidCount);
    line2 = bidCount === 1 ? "bid" : "bids";
  }

  return (
    <View
      style={[styles.statusChip, dense && styles.statusChipDense]}
      accessibilityLabel={
        isDone
          ? "Completed"
          : isAwardedPendingTrip
            ? "Supplier claimed"
            : `${bidCount} bids`
      }
    >
      <View style={[styles.statusChipIcon, dense && styles.statusChipIconDense]}>
        {icon}
      </View>
      <View style={styles.statusChipTextWrap}>
        <Text
          style={[styles.statusChipLine1, dense && styles.statusChipLine1Dense]}
          numberOfLines={1}
        >
          {line1}
        </Text>
        {line2 ? (
          <Text
            style={[styles.statusChipLine2, dense && styles.statusChipLine2Dense]}
            numberOfLines={1}
          >
            {line2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type GetLoadQuoteChipVariant =
  | "open"
  | "pending"
  | "rejected"
  | "accepted"
  | "done";

export function GetLoadQuoteChip({
  variant,
  quoteAmount,
  dense,
}: {
  variant: GetLoadQuoteChipVariant;
  quoteAmount?: number;
  dense?: boolean;
}) {
  const hasQuote =
    variant === "pending" || variant === "accepted" || variant === "done";
  let line1 = "Open";
  let line2 = "";
  let amountLine = false;

  switch (variant) {
    case "pending":
      line1 = formatINRChip(Number(quoteAmount ?? 0));
      line2 = "quoted";
      amountLine = true;
      break;
    case "rejected":
      line1 = "No";
      line2 = "bid";
      break;
    case "accepted":
      line1 = "Won";
      line2 = quoteAmount != null ? formatINRChip(quoteAmount) : "";
      amountLine = Boolean(line2);
      break;
    case "done":
      line1 = "Done";
      break;
    default:
      line1 = "Open";
      line2 = "bid";
      break;
  }

  return (
    <View
      style={[
        styles.statusChip,
        styles.statusChipQuote,
        dense && styles.statusChipDense,
        dense && styles.statusChipQuoteDense,
      ]}
    >
      <View style={[styles.statusChipIcon, dense && styles.statusChipIconDense]}>
        <Package
          size={dense ? 10 : 12}
          color={hasQuote ? Theme.textPrimaryDark : Theme.textMuted}
          strokeWidth={2.2}
        />
      </View>
      <View style={styles.statusChipTextWrap}>
        <Text
          style={[
            styles.statusChipLine1,
            dense && styles.statusChipLine1Dense,
            amountLine && styles.statusChipAmount,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {line1}
        </Text>
        {line2 ? (
          <Text
            style={[styles.statusChipLine2, dense && styles.statusChipLine2Dense]}
            numberOfLines={1}
          >
            {line2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type GiveLoadIndentCardActionsProps = LoadCenterIndentCardActionsLayout & {
  load: IndentRow;
  bidCount: number;
  isDone: boolean;
  isDraft: boolean;
  isAwardedPendingTrip: boolean;
  isAwaitingSupplierDeploy: boolean;
  showPulseToNetwork: boolean;
  onShareToNetwork?: (load: IndentRow) => void;
  onIndentPress: (load: IndentRow) => void;
  onShareIndent: (load: IndentRow) => void;
  onBroadcastDraft: (load: IndentRow) => void;
  onOpenAwardModal: (load: IndentRow) => void;
  awardedAmountLabel?: string | null;
};

export function GiveLoadIndentCardActions({
  load,
  bidCount,
  isDone,
  isDraft,
  isAwardedPendingTrip,
  isAwaitingSupplierDeploy,
  showPulseToNetwork,
  onShareToNetwork,
  onIndentPress,
  onShareIndent,
  onBroadcastDraft,
  onOpenAwardModal,
  awardedAmountLabel,
  dense,
  style,
}: GiveLoadIndentCardActionsProps) {
  const shareOpensDetail = isDone || isAwardedPendingTrip;
  const showPulse = showPulseToNetwork && Boolean(onShareToNetwork);

  const statusChip = (
    <GiveLoadBidChip
      bidCount={bidCount}
      isDone={isDone}
      isAwardedPendingTrip={isAwardedPendingTrip}
      awardedAmountLabel={awardedAmountLabel}
      dense={dense}
    />
  );

  const share = (
    <ShareIconButton
      dense={dense}
      label={shareOpensDetail ? "View detail" : "Share indent"}
      onPress={() =>
        shareOpensDetail ? onIndentPress(load) : onShareIndent(load)
      }
    />
  );

  const primary =
    isDone ? null : isAwaitingSupplierDeploy ? (
      <PendingChip dense={dense} />
    ) : (
      <PrimaryButton
        dense={dense}
        inline={dense}
        label={compactGiveLoadCtaLabel(
          isDraft ? "Broadcast" : "Review Hub",
          dense,
        )}
        onPress={() => {
          if (isDraft) {
            onBroadcastDraft(load);
            return;
          }
          onOpenAwardModal(load);
        }}
      />
    );

  const pulse = showPulse ? (
    <PulseButton dense={dense} onPress={() => onShareToNetwork!(load)} />
  ) : null;

  const primarySlot =
    primary ?? (dense ? <PrimaryToolbarPlaceholder dense /> : null);

  if (dense) {
    return (
      <View style={style}>
        <GridToolbarRow
          status={statusChip}
          share={share}
          primary={primarySlot}
          pulse={pulse}
        />
      </View>
    );
  }

  return (
    <View style={style}>
      <InlineActionRow>
        {statusChip}
        {share}
        {primary}
        {pulse}
      </InlineActionRow>
    </View>
  );
}

function compactGiveLoadCtaLabel(label: string, dense?: boolean): string {
  if (!dense) return label;
  if (label === "Review Hub") return "Review";
  if (label === "Broadcast") return "Broadcast";
  return label;
}

export type GetLoadIndentCardActionsProps = LoadCenterIndentCardActionsLayout & {
  load: IndentRow;
  isAccepted: boolean;
  isDoneOutcome: boolean;
  ctaLabel: string;
  quoteVariant: GetLoadQuoteChipVariant;
  quoteAmount?: number;
  onIndentPress: (load: IndentRow) => void;
  onShareIndent: (load: IndentRow) => void;
  onOpenBidModal: (load: IndentRow) => void;
  onGoToClaimed: () => void;
};

function compactGetLoadCtaLabel(label: string, dense?: boolean): string {
  if (!dense) return label;
  switch (label) {
    case "Update quote":
      return "Update";
    case "View details":
      return "Details";
    case "View claimed":
      return "Claimed";
    case "New quote":
      return "Rebid";
    default:
      return label;
  }
}

export function GetLoadIndentCardActions({
  load,
  isAccepted,
  isDoneOutcome,
  ctaLabel,
  quoteVariant,
  quoteAmount,
  onIndentPress,
  onShareIndent,
  onOpenBidModal,
  onGoToClaimed,
  dense,
  style,
}: GetLoadIndentCardActionsProps) {
  const onPrimary = () => {
    if (isAccepted) {
      if (isDoneOutcome) {
        onIndentPress(load);
        return;
      }
      onGoToClaimed();
      return;
    }
    onOpenBidModal(load);
  };

  const statusChip = (
    <GetLoadQuoteChip
      variant={quoteVariant}
      quoteAmount={quoteAmount}
      dense={dense}
    />
  );
  const share = (
    <ShareIconButton
      dense={dense}
      label="Share load"
      onPress={() => onShareIndent(load)}
    />
  );
  const primary = (
    <PrimaryButton
      dense={dense}
      inline={dense}
      label={compactGetLoadCtaLabel(ctaLabel, dense)}
      onPress={onPrimary}
    />
  );

  if (dense) {
    return (
      <View style={style}>
        <GridToolbarRow
          status={statusChip}
          share={share}
          primary={primary}
        />
      </View>
    );
  }

  return (
    <View style={style}>
      <InlineActionRow>
        {statusChip}
        {share}
        <View style={styles.primaryGrow}>{primary}</View>
      </InlineActionRow>
    </View>
  );
}

export type ClaimedIndentCardActionsProps = LoadCenterIndentCardActionsLayout & {
  load: IndentRow;
  isDone: boolean;
  assigning: boolean;
  onIndentPress: (load: IndentRow) => void;
  onShareIndent: (load: IndentRow) => void;
  onAssignDeploy: (load: IndentRow) => void;
};

export function ClaimedIndentCardActions({
  load,
  isDone,
  assigning,
  onIndentPress,
  onShareIndent,
  onAssignDeploy,
  dense,
  style,
}: ClaimedIndentCardActionsProps) {
  const statusChip = (
    <View style={[styles.statusChip, dense && styles.statusChipDense]}>
      <View style={[styles.statusChipIcon, dense && styles.statusChipIconDense]}>
        <FontAwesome
          name={isDone ? "check-circle" : "truck"}
          size={dense ? 10 : 12}
          color={isDone ? Theme.positive : Theme.textMuted}
        />
      </View>
      <View style={styles.statusChipTextWrap}>
        <Text
          style={[styles.statusChipLine1, dense && styles.statusChipLine1Dense]}
          numberOfLines={1}
        >
          {isDone ? "Done" : "Ready"}
        </Text>
      </View>
    </View>
  );

  const share = (
    <ShareIconButton
      dense={dense}
      label="Share load"
      onPress={() => onShareIndent(load)}
    />
  );
  const primary = (
    <PrimaryButton
      dense={dense}
      inline={dense}
      label={
        isDone ? "View" : assigning ? "…" : "Assign vehicle"
      }
      onPress={() => (isDone ? onIndentPress(load) : onAssignDeploy(load))}
      disabled={assigning}
    />
  );

  if (dense) {
    return (
      <View style={style}>
        <GridToolbarRow
          status={statusChip}
          share={share}
          primary={primary}
        />
      </View>
    );
  }

  return (
    <View style={style}>
      <InlineActionRow>
        {statusChip}
        {share}
        <View style={styles.primaryGrow}>{primary}</View>
      </InlineActionRow>
    </View>
  );
}

/** @deprecated Use GiveLoadBidChip inside GiveLoadIndentCardActions */
export function GiveLoadBidMeta(props: Parameters<typeof GiveLoadBidChip>[0]) {
  return <GiveLoadBidChip {...props} />;
}


const styles = StyleSheet.create({
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FOOTER_BORDER,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
    width: "100%",
    minWidth: 0,
  },
  footerDense: {
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 8,
    minHeight: ROW_HEIGHT + 16,
    justifyContent: "center",
  },
  denseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
    height: ROW_HEIGHT,
    ...Platform.select({
      web: { columnGap: 6, rowGap: 0 } as ViewStyle,
      default: {},
    }),
  },
  toolbarStatusSlot: {
    width: TOOLBAR_STATUS_SLOT_W,
    flexShrink: 0,
    alignItems: "flex-start",
  },
  ctaGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    overflow: "hidden",
    gap: 6,
    ...Platform.select({
      web: { columnGap: 6 } as ViewStyle,
      default: {},
    }),
  },
  primarySlot: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  trailingSlot: {
    flexShrink: 0,
    marginLeft: 2,
  },
  primaryToolbarPlaceholder: {
    width: "100%",
    minHeight: ROW_HEIGHT,
    borderRadius: 8,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 8,
    width: "100%",
  },
  primaryGrow: {
    flex: 1,
    minWidth: 0,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    maxWidth: 56,
    minWidth: 44,
    height: ROW_HEIGHT,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statusChipDense: {
    height: ROW_HEIGHT,
    gap: 3,
    paddingHorizontal: 3,
  },
  statusChipQuote: {
    minWidth: 48,
    maxWidth: 68,
  },
  statusChipQuoteDense: {
    minWidth: 44,
    maxWidth: 64,
  },
  statusChipAmount: {
    textTransform: "none",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
  },
  statusChipIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusChipIconDense: {
    width: 16,
    height: 16,
  },
  statusChipTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  statusChipLine1: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    lineHeight: 11,
  },
  statusChipLine1Dense: {
    fontSize: 8,
    lineHeight: 10,
  },
  statusChipLine2: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    lineHeight: 9,
  },
  statusChipLine2Dense: {
    fontSize: 7,
    lineHeight: 8,
  },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  shareBtnDense: {
    width: ROW_HEIGHT,
    height: ROW_HEIGHT,
    borderRadius: 8,
  },
  pulseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0,
    flexGrow: 0,
    minWidth: 52,
    height: ROW_HEIGHT,
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingHorizontal: 7,
  },
  pulseBtnDense: {
    minWidth: 48,
    maxWidth: TOOLBAR_PULSE_SLOT_W,
    height: ROW_HEIGHT,
    paddingHorizontal: 6,
  },
  pulseBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.1,
  },
  pulseBtnTextDense: {
    fontSize: 9,
  },
  primaryBtn: {
    backgroundColor: TESLA_BLACK,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnDense: {
    minHeight: ROW_HEIGHT,
    height: ROW_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 8,
  },
  primaryBtnInline: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  primaryBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  primaryBtnTextDense: {
    fontSize: 8,
    letterSpacing: 0.2,
  },
  pendingChip: {
    flex: 1,
    minWidth: 0,
    height: ROW_HEIGHT,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pendingChipDense: {
    height: ROW_HEIGHT,
  },
  pendingText: {
    fontSize: 8,
    fontWeight: 700,
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
