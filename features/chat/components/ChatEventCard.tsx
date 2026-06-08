import React, { useSyncExternalStore } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Truck,
  MapPin,
  XCircle,
  Clock,
  Send,
  Package,
} from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
} from "@/lib/partyAvatarDisplay";
import type { LedgerEventMetadata, TripMessageRow } from "../types/chat.types";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import {
  getLedgerBookPendingSnapshot,
  subscribeLedgerBookPending,
} from "@/lib/ledgerBookPendingStore";

// ── System event card (trip status changes) ───────────────────────────────────

type StatusIconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const STATUS_ICON_MAP: Record<
  string,
  {
    Icon: StatusIconComponent;
    color: string;
    bg: string;
    /** Short label for meta line (matches payment card middle segment). */
    sheetLabel: string;
    /** Bold right column (payment “amount” slot). */
    rightWord: string;
    rightColor: string;
  }
> = {
  assigned: {
    Icon: Truck,
    color: CHAT_ACCENT,
    bg: CHAT_ACCENT_SOFT,
    sheetLabel: "Assigned",
    rightWord: "NEW",
    rightColor: "#4338ca",
  },
  in_progress: {
    Icon: Send,
    color: "#5c6bc0",
    bg: "#e8eaf6",
    sheetLabel: "In progress",
    rightWord: "ACTIVE",
    rightColor: "#4338ca",
  },
  picked_up: {
    Icon: MapPin,
    color: "#f59e0b",
    bg: "#fffbeb",
    sheetLabel: "Pickup",
    rightWord: "LOAD",
    rightColor: "#b45309",
  },
  in_transit: {
    Icon: Truck,
    color: "#06b6d4",
    bg: "#ecfeff",
    sheetLabel: "In transit",
    rightWord: "LEG",
    rightColor: "#0e7490",
  },
  at_drop: {
    Icon: MapPin,
    color: "#10b981",
    bg: "#ecfdf5",
    sheetLabel: "At drop",
    rightWord: "DROP",
    rightColor: "#047857",
  },
  completed: {
    Icon: CheckCircle,
    color: "#22c55e",
    bg: "#f0fdf4",
    sheetLabel: "Completed",
    rightWord: "DONE",
    rightColor: "#047857",
  },
  cancelled: {
    Icon: XCircle,
    color: "#ef4444",
    bg: "#fef2f2",
    sheetLabel: "Cancelled",
    rightWord: "VOID",
    rightColor: "#be123c",
  },
  pending: {
    Icon: Clock,
    color: "#94a3b8",
    bg: "#f1f5f9",
    sheetLabel: "Pending",
    rightWord: "WAIT",
    rightColor: "#64748b",
  },
  started: {
    Icon: Send,
    color: "#5c6bc0",
    bg: "#e8eaf6",
    sheetLabel: "Started",
    rightWord: "START",
    rightColor: "#4338ca",
  },
  delivered: {
    Icon: Package,
    color: "#10b981",
    bg: "#ecfdf5",
    sheetLabel: "Delivered",
    rightWord: "POD",
    rightColor: "#047857",
  },
  default: {
    Icon: Clock,
    color: "#94a3b8",
    bg: "#f8fafc",
    sheetLabel: "Update",
    rightWord: "INFO",
    rightColor: "#475569",
  },
};

function inferStatusFromContent(content: string): keyof typeof STATUS_ICON_MAP {
  const c = content.toLowerCase();
  if (c.includes("accepted") || c.includes("heading to pickup")) return "in_progress";
  if (c.includes("pickup point") || c.includes("reached the pickup")) return "picked_up";
  if (c.includes("in transit") || c.includes("departed")) return "in_transit";
  if (c.includes("reached the destination")) return "at_drop";
  if (c.includes("completed")) return "completed";
  if (c.includes("cancelled")) return "cancelled";
  if (c.includes("assigned")) return "assigned";
  if (c.includes("changed") || c.includes("reassigned") || c.includes("unassigned"))
    return "assigned";
  return "default";
}

/** WhatsApp-style “protocol / milestone” system ribbon (completed + protocol copy). */
function shouldUsePulseProtocolSystemCard(
  content: string,
  statusKey: keyof typeof STATUS_ICON_MAP,
): boolean {
  const c = (content ?? "").toLowerCase();
  if (statusKey === "completed" || statusKey === "delivered") return true;
  return (
    c.includes("protocol") ||
    c.includes("threshold") ||
    c.includes("destination threshold") ||
    c.includes("trip protocol")
  );
}

export function getStatusEventSheetVisuals(statusKey: string) {
  const row = STATUS_ICON_MAP[statusKey as keyof typeof STATUS_ICON_MAP];
  return row ?? STATUS_ICON_MAP.default;
}

// ── Ledger event card (payment / adjustment) ──────────────────────────────────

interface LedgerCardProps {
  message: TripMessageRow;
  currentOrgId: string;
  /** Chat thread party (linked client/supplier name) — fills missing receiver on cash-in rows. */
  conversationPartyName?: string | null;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  /** Driver / embedded views: show the card UI without add-to-book or dispute actions. */
  readOnly?: boolean;
  /** Integrated indent commercial lane only — hides Add to book / Dispute row when false. */
  hideLedgerActions?: boolean;
}

/**
 * Full metadata usually includes sender/receiver org names. Older/test RPC payloads often omit them;
 * we still persist human-readable `content` from chatLedgerBridge — parse that and use conv party name.
 */
function resolvedLedgerOrgLine(
  meta: LedgerEventMetadata,
  content: string,
  conversationPartyName?: string | null,
): string {
  let sender = (meta.sender_org_name ?? "").trim();
  let receiver = (meta.receiver_org_name ?? "").trim();
  const flow = meta.flow === "out" ? "out" : "in";
  const c = (content ?? "").trim();
  const party = (conversationPartyName ?? "").trim();

  if (!sender || !receiver) {
    if (flow === "in") {
      const needle = " received ";
      const i = c.indexOf(needle);
      if (i > 0) {
        const fromContent = c.slice(0, i).trim();
        if (!sender && fromContent) sender = fromContent;
      }
      // Cash-in line does not encode counterparty org; use whom this conversation is with.
      if (!receiver && party) receiver = party;
    } else {
      const paidIdx = c.indexOf(" paid ");
      const toIdx = c.indexOf(" to ");
      const dotIdx = c.indexOf(" · ");
      if (paidIdx > 0 && toIdx > paidIdx && dotIdx > toIdx) {
        if (!sender) sender = c.slice(0, paidIdx).trim();
        if (!receiver) receiver = c.slice(toIdx + 4, dotIdx).trim();
      }
      if (!receiver && party) receiver = party;
    }
  }

  const left = sender || "—";
  const right = receiver || "—";
  return `${left} → ${right}`;
}

function splitOrgLine(orgLine: string): { from: string; to: string } {
  const trimmed = (orgLine ?? "").trim();
  const arrow = trimmed.split(/\s*→\s*/);
  if (arrow.length >= 2) {
    return {
      from: arrow[0]?.trim() || "—",
      to: arrow.slice(1).join(" → ").trim() || "—",
    };
  }
  return { from: trimmed || "—", to: "" };
}

export function formatTripEventSheetDate(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toUpperCase();
  } catch {
    return "";
  }
}

export function ChatLedgerEventCard({
  message,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  readOnly = false,
  hideLedgerActions = false,
  isMobile = false,
}: LedgerCardProps & { isMobile?: boolean }) {
  const addingToBook = useSyncExternalStore(
    subscribeLedgerBookPending,
    () => getLedgerBookPendingSnapshot().has(message.id),
    () => false,
  );

  if (!ledgerEventInvolvesOrg(message, currentOrgId)) return null;
  const meta = message.metadata as LedgerEventMetadata | null;
  if (!meta) return null;

  const isReceiver =
    String(meta.receiver_org_id ?? "").trim() === String(currentOrgId ?? "").trim();
  const isSender =
    String(meta.sender_org_id ?? "").trim() === String(currentOrgId ?? "").trim();
  if (!isReceiver && !isSender) return null;

  const directionLabel =
    isReceiver && !isSender
      ? "Incoming payment"
      : isSender && !isReceiver
        ? "Outgoing payment"
        : "Transfer";

  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowPrefix = flow === "in" ? "+" : "−";
  const isAcknowledged = !!meta.acknowledged_at || !!meta.is_booked;
  const isDisputed = !!meta.disputed;

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const orgLine = resolvedLedgerOrgLine(meta, message.content, conversationPartyName);
  const { from: fromParty, to: toParty } = splitOrgLine(orgLine);

  const titleParty = flow === "in" ? fromParty : toParty;
  const titleDisplay = formatChatPartyName(titleParty);
  const namedOther = [fromParty, toParty].find((p) => formatChatPartyName(p));
  const avatarSeedName = titleDisplay ? titleParty : namedOther || "Payment";
  const avatarBg = partyAvatarBackgroundColor(avatarSeedName);
  const avatarFg = partyAvatarInitialsTextColor(avatarBg);
  const dateUpper = formatTripEventSheetDate(message.created_at);
  const metaMid = [paymentModeLabel, meta.category].filter(Boolean).join(" · ") || "—";
  const routeLine = `${fromParty.toUpperCase()} → ${toParty.toUpperCase()}`;

  const isCredit = flow === "in";
  const amountColor = isCredit ? "#047857" : "#be123c";

  const avatarEl = (
    <View style={[s.ledgerAvatarWrap, s.ledgerAvatarWrapAlign, isMobile && s.ledgerAvatarWrapMobile]}>
      <View
        style={[
          s.ledgerAvatar,
          isMobile && s.ledgerAvatarMobile,
          { backgroundColor: avatarBg },
        ]}
      >
        <Text style={[s.ledgerAvatarInitials, { color: avatarFg }]}>
          {partyInitialsFromName(avatarSeedName)}
        </Text>
      </View>
      <View
        style={[
          s.ledgerAvatarDot,
          { backgroundColor: isDisputed ? "#f59e0b" : "#22c55e" },
        ]}
      />
    </View>
  );

  const bodyEl = (
    <View style={s.ledgerBody}>
      {titleDisplay ? (
        <Text
          style={[s.ledgerTitle, isMobile && s.ledgerTitleMobile]}
          numberOfLines={isMobile ? 3 : 1}
        >
          {titleDisplay}
        </Text>
      ) : null}
      <Text
        style={[s.ledgerMeta, isMobile && s.ledgerMetaMobile]}
        numberOfLines={isMobile ? 3 : 1}
      >
        {directionLabel}
        {" · "}
        {dateUpper}
        {" · "}
        {metaMid}
      </Text>
      <Text
        style={[s.ledgerRoute, isMobile && s.ledgerRouteMobile]}
        numberOfLines={isMobile ? 2 : 1}
      >
        {routeLine}
      </Text>
    </View>
  );

  return (
    <View style={[s.ledgerWrap, isMobile && s.ledgerWrapMobile]}>
      <View style={[s.ledgerCard, isMobile && s.ledgerCardMobile]}>
        {isMobile ? (
          <>
            <View style={s.ledgerTopRowMobile}>
              {avatarEl}
              {bodyEl}
            </View>
            <View style={s.ledgerFooterMobile}>
              <Text style={[s.ledgerAmountMobile, { color: amountColor }]} numberOfLines={1}>
                {flowPrefix}
                {amountLabel}
              </Text>
              <Text style={s.ledgerTimeMobile} numberOfLines={1}>
                {displayTime}
              </Text>
            </View>
          </>
        ) : (
          <>
            {avatarEl}
            {bodyEl}
            <View style={s.ledgerRight}>
              <Text style={[s.ledgerAmount, { color: amountColor }]} numberOfLines={1}>
                {flowPrefix}
                {amountLabel}
              </Text>
              <Text style={s.ledgerTimeRight} numberOfLines={1}>
                {displayTime}
              </Text>
            </View>
            <View style={s.ledgerChevronWrap}>
              <ChevronRight size={14} color="#cbd5e1" />
            </View>
          </>
        )}
      </View>

      {meta.notes ? (
        <Text style={s.ledgerNotesBelow} numberOfLines={2}>
          {meta.notes}
        </Text>
      ) : null}

      {isAcknowledged ? (
        <View style={s.ledgerFooterStatus}>
          <CheckCircle size={11} color="#059669" />
          <Text style={s.ledgerFooterStatusText}>Added to book</Text>
        </View>
      ) : isDisputed ? (
        <View style={s.ledgerFooterStatus}>
          <AlertTriangle size={11} color="#d97706" />
          <Text style={[s.ledgerFooterStatusText, { color: "#b45309" }]}>Dispute raised</Text>
        </View>
      ) : !readOnly && !hideLedgerActions && isReceiver && !isSender ? (
        <View style={s.ledgerActions}>
          <TouchableOpacity
            style={s.ledgerAddBtn}
            onPress={() => onAddToBook(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            {addingToBook ? (
              <LoadingIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.ledgerAddBtnText}>Add to book</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.ledgerDisputeBtn}
            onPress={() => onDispute(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            <Text style={s.ledgerDisputeBtnText}>Dispute</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Ledger row — same footprint as system updates (payment-style sheet)
  ledgerWrap: {
    alignSelf: "center",
    maxWidth: "85%",
    marginVertical: 4,
  },
  ledgerCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  ledgerAvatarWrap: {
    width: 34,
    height: 34,
    position: "relative",
    flexShrink: 0,
  },
  ledgerAvatarWrapAlign: {
    alignSelf: "center",
  },
  ledgerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  ledgerAvatarInitials: {
    fontSize: 11,
    fontWeight: "800",
  },
  ledgerAvatarDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  ledgerBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
    paddingVertical: 1,
  },
  ledgerTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  ledgerMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.02,
    lineHeight: 14,
  },
  ledgerRoute: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    letterSpacing: 0.1,
    lineHeight: 13,
  },
  ledgerRight: {
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 3,
    paddingLeft: 12,
    marginLeft: 2,
    borderLeftWidth: 1,
    borderLeftColor: "#f1f5f9",
    minWidth: 86,
    maxWidth: "36%",
  },
  ledgerAmount: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 16,
  },
  ledgerTimeRight: {
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    opacity: 0.95,
  },
  ledgerChevronWrap: {
    justifyContent: "center",
    alignSelf: "center",
    paddingLeft: 4,
    marginLeft: 2,
  },
  ledgerNotesBelow: {
    marginTop: 6,
    fontSize: 10,
    color: "#64748b",
    lineHeight: 14,
    fontWeight: "600",
    paddingHorizontal: 2,
  },
  ledgerFooterStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignSelf: "flex-start",
  },
  ledgerFooterStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
  },
  ledgerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  ledgerAddBtn: {
    flex: 1,
    backgroundColor: CHAT_ACCENT,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  ledgerAddBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  ledgerDisputeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fbbf24",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  ledgerDisputeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  ledgerWrapMobile: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    marginVertical: CHAT_MOBILE.eventCardGap / 2,
  },
  ledgerCardMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: CHAT_MOBILE.eventCardPadH,
    paddingVertical: CHAT_MOBILE.eventCardPadV,
    borderRadius: CHAT_MOBILE.eventCardRadius,
    borderColor: "#E9EDEF",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 0,
  },
  ledgerTopRowMobile: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  ledgerAvatarWrapMobile: {
    width: CHAT_MOBILE.eventAvatar,
    height: CHAT_MOBILE.eventAvatar,
  },
  ledgerAvatarMobile: {
    width: CHAT_MOBILE.eventAvatar,
    height: CHAT_MOBILE.eventAvatar,
    borderRadius: CHAT_MOBILE.eventAvatar / 2,
  },
  ledgerTitleMobile: {
    fontSize: CHAT_MOBILE.eventTitleSize,
    lineHeight: CHAT_MOBILE.eventTitleLine,
    fontWeight: "600",
    color: "#111B21",
  },
  ledgerMetaMobile: {
    fontSize: CHAT_MOBILE.eventMetaSize,
    lineHeight: CHAT_MOBILE.eventMetaLine,
    color: "#667781",
    fontWeight: "500",
    letterSpacing: 0,
    textTransform: "none",
  },
  ledgerRouteMobile: {
    fontSize: CHAT_MOBILE.eventSubSize,
    lineHeight: 14,
    color: "#8696A0",
    letterSpacing: 0,
    textTransform: "none",
  },
  ledgerFooterMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E9EDEF",
    gap: 8,
  },
  ledgerAmountMobile: {
    fontSize: CHAT_MOBILE.eventAmountSize,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  ledgerTimeMobile: {
    fontSize: CHAT_MOBILE.eventTimeSize,
    fontWeight: "600",
    color: "#8696A0",
    flexShrink: 0,
    textTransform: "none",
    letterSpacing: 0,
  },
  pulseProtoCardMobile: {
    borderLeftWidth: 3,
    borderLeftColor: "#10b981",
  },
  // Pulse-style system protocol ribbon (completed / milestone)
  pulseProtoWrap: {
    alignSelf: "center",
    maxWidth: "92%",
    width: "100%",
    marginVertical: 6,
  },
  pulseProtoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 4,
    borderTopColor: "#e8ecf1",
    borderRightColor: "#e8ecf1",
    borderBottomColor: "#e8ecf1",
    borderLeftColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: "#059669",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pulseProtoIconCol: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseProtoIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseProtoLiveDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10b981",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  pulseProtoDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#f1f5f9",
    marginVertical: 2,
  },
  pulseProtoBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 4,
    gap: 4,
  },
  pulseProtoTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 16,
  },
  pulseProtoSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 14,
  },
  pulseProtoRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 6,
    paddingLeft: 6,
  },
  pulseProtoBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pulseProtoBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#047857",
    letterSpacing: 0.6,
  },
  pulseProtoTime: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  /** ── TripProgressEventCard (modern, txn-card-aligned) ──────────────────
   *  Visual language mirrors `FinanceKanbanTab`'s `timelineCard` so a
   *  system update reads as a peer of a transaction row:
   *    • Soft 18 px rounded card on a near-white background with the
   *      same hairline border `rgba(0,0,0,0.04)` and ultra-subtle
   *      shadow (`opacity 0.04`, `radius 8`) the txn rows use.
   *    • 32 px circular avatar with a *status-tinted* fill +
   *      1.5 px status-color border — the same trick the txn card
   *      uses (green-tinted border for cash-in, red-tinted for
   *      cash-out), but keyed by status color instead of flow.
   *    • An italic uppercase **kicker** above the narrative title
   *      ("SYSTEM UPDATE", "TRIP STATUS", "LIVE LOCATION") tinted in
   *      the status color — this is the direct analogue of the
   *      txn card's italic uppercase party name (`timelineCardParty`
   *      → `FinanceTxnTypography.partyTitle`).
   *    • A pill on the right that copies the txn `tripPillWithCheck`
   *      shape: rounded 999, very light status-tinted fill, hairline
   *      border, tiny leading status dot, italic uppercase text in
   *      the status color (same recipe as `tripPillText` →
   *      `FinanceTxnTypography.tripId`).
   *    • Subtle 8 px chevron at the bottom-right at `opacity: 0.3`
   *      mirroring the txn card's `expandHint`. */
  progressWrap: {
    alignSelf: "center",
    maxWidth: "85%",
    width: "100%",
    marginVertical: 4,
  },
  progressWrapMobile: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    marginVertical: CHAT_MOBILE.eventCardGap / 2,
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    position: "relative",
  },
  progressCardMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
    paddingHorizontal: CHAT_MOBILE.eventCardPadH,
    paddingVertical: CHAT_MOBILE.eventCardPadV,
    borderRadius: CHAT_MOBILE.eventCardRadius,
    borderColor: "rgba(0,0,0,0.05)",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  progressTopRowMobile: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  progressAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    flexShrink: 0,
  },
  progressAvatarMobile: {
    width: CHAT_MOBILE.eventAvatar,
    height: CHAT_MOBILE.eventAvatar,
    borderRadius: CHAT_MOBILE.eventAvatar / 2,
  },
  progressAvatarText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  progressBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  /** Italic uppercase kicker — exact `FinanceTxnTypography.partyTitle`
   *  recipe but tinted in the status color so it reads as a status
   *  tag. Sits above the narrative sentence so the eye lands on
   *  "SYSTEM UPDATE" / "TRIP STATUS" first. */
  progressKicker: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  progressKickerMobile: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  /** Narrative sentence — kept in sentence case (it's prose, not a
   *  proper noun like the txn party name). Weight + size echo the
   *  txn `amount` text so it carries the same visual weight in the
   *  card hierarchy. */
  progressTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
    marginTop: 1,
  },
  progressTitleMobile: {
    fontSize: CHAT_MOBILE.eventTitleSize,
    lineHeight: CHAT_MOBILE.eventTitleLine,
    fontWeight: "500",
    color: "#111B21",
    marginTop: 1,
  },
  /** Date · meta · status label — direct copy of
   *  `timelineCardDateVehicle`: 8 px UPPERCASE, slate, letterSpacing
   *  0.5. */
  progressMeta: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  progressMetaMobile: {
    fontSize: CHAT_MOBILE.eventMetaSize,
    lineHeight: CHAT_MOBILE.eventMetaLine,
    fontWeight: "400",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  /** Optional sub line — italic muted, matches
   *  `timelineCardRouteWhy`. */
  progressSub: {
    fontSize: 8,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 2,
    opacity: 0.95,
  },
  progressSubMobile: {
    fontSize: CHAT_MOBILE.eventSubSize,
    lineHeight: 13,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 2,
  },
  progressRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 0,
  },
  /** Status pill — same chrome as the txn card's
   *  `tripPillWithCheck` (rounded 999, very light fill, hairline
   *  border, leading icon + label). The tiny solid dot replaces the
   *  txn check-circle but keeps the same visual rhythm. */
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  progressPillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  /** Pill label — italic uppercase status color, same recipe as
   *  `tripPillText` → `FinanceTxnTypography.tripId`. */
  progressPillText: {
    ...FinanceTxnTypography.tripId,
  },
  progressTime: {
    ...FinanceTxnTypography.dateLine,
    fontSize: 8,
    lineHeight: 11,
    color: Theme.textMuted,
  },
  /** Bottom-right chevron — mirrors `expandHint` from the txn card
   *  (8 px, opacity 0.3). Visual cue only; rows themselves are not
   *  navigable so we don't wrap the chevron in a TouchableOpacity. */
  progressExpandHint: {
    position: "absolute",
    bottom: 4,
    right: 12,
    opacity: 0.3,
  },
  progressFooterMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 8,
  },
  progressPillMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  progressPillTextMobile: {
    ...FinanceTxnTypography.tripId,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  progressTimeMobile: {
    ...FinanceTxnTypography.dateLine,
    fontSize: CHAT_MOBILE.eventTimeSize,
    color: Theme.textMuted,
    flexShrink: 0,
  },
});

export interface TripProgressEventCardProps {
  avatarSeed: string;
  avatarDotColor: string;
  title: string;
  metaLine: string;
  subLine?: string | null;
  rightPrimary: string;
  rightPrimaryColor: string;
  time: string;
  isMobile?: boolean;
}

/** Pad a #rgb / #rrggbb hex to #rrggbb so we can safely append an
 *  alpha suffix (e.g. `#1234561F`). Non-hex inputs (e.g. `rgb(...)`)
 *  fall back to the literal value — the helper is only used to
 *  derive tinted variants of the STATUS_ICON_MAP rightColors which
 *  are all 6-digit hex literals. */
function hexWithAlpha(hex: string, alphaHex: string): string {
  if (typeof hex !== "string" || !hex.startsWith("#")) return hex;
  if (hex.length === 7) return `${hex}${alphaHex}`;
  if (hex.length === 4) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return hex;
}

/** Split the conventional `"Kicker · DATE · Status"` meta string into
 *  an italic-uppercase kicker and the remaining UPPERCASE date / status
 *  string. Falls back gracefully if no separator is present. */
function splitProgressMetaLine(metaLine: string): {
  kicker: string;
  rest: string;
} {
  const sep = " · ";
  const i = metaLine.indexOf(sep);
  if (i < 0) return { kicker: metaLine.trim(), rest: "" };
  return {
    kicker: metaLine.slice(0, i).trim(),
    rest: metaLine.slice(i + sep.length).trim(),
  };
}

/**
 * Modern system-update card. Mirrors the finance transaction row
 * (`FinanceKanbanTab` → `timelineCard`) — same chrome, same italic
 * uppercase kicker, same trip-style pill on the right, same subtle
 * bottom-right chevron. Status color theming ties the avatar, kicker,
 * and pill into a single status-themed unit.
 */
export function TripProgressEventCard({
  avatarSeed,
  avatarDotColor: _avatarDotColor,
  title,
  metaLine,
  subLine,
  rightPrimary,
  rightPrimaryColor,
  time,
  isMobile = false,
}: TripProgressEventCardProps) {
  const { kicker, rest: dateMeta } = splitProgressMetaLine(metaLine);

  const avatarBg = hexWithAlpha(rightPrimaryColor, "1F");
  const avatarBorder = hexWithAlpha(rightPrimaryColor, "55");
  const pillBg = hexWithAlpha(rightPrimaryColor, "12");
  const pillBorder = hexWithAlpha(rightPrimaryColor, "3D");

  const avatarEl = (
    <View
      style={[
        s.progressAvatar,
        isMobile && s.progressAvatarMobile,
        { backgroundColor: avatarBg, borderColor: avatarBorder },
      ]}
    >
      <Text style={[s.progressAvatarText, { color: rightPrimaryColor }]}>
        {partyInitialsFromName(avatarSeed)}
      </Text>
    </View>
  );

  const bodyEl = (
    <View style={s.progressBody}>
      {kicker ? (
        <Text
          style={[
            isMobile ? s.progressKickerMobile : s.progressKicker,
            { color: rightPrimaryColor },
          ]}
          numberOfLines={1}
        >
          {kicker}
        </Text>
      ) : null}
      <Text
        style={[s.progressTitle, isMobile && s.progressTitleMobile]}
        numberOfLines={isMobile ? 3 : 2}
      >
        {title}
      </Text>
      {dateMeta ? (
        <Text
          style={[s.progressMeta, isMobile && s.progressMetaMobile]}
          numberOfLines={1}
        >
          {dateMeta}
        </Text>
      ) : null}
      {subLine ? (
        <Text
          style={[s.progressSub, isMobile && s.progressSubMobile]}
          numberOfLines={isMobile ? 2 : 1}
        >
          {subLine}
        </Text>
      ) : null}
    </View>
  );

  const pillEl = (
    <View
      style={[
        isMobile ? s.progressPillMobile : s.progressPill,
        { backgroundColor: pillBg, borderColor: pillBorder },
      ]}
    >
      <View style={[s.progressPillDot, { backgroundColor: rightPrimaryColor }]} />
      <Text
        style={[
          isMobile ? s.progressPillTextMobile : s.progressPillText,
          { color: rightPrimaryColor },
        ]}
        numberOfLines={1}
      >
        {rightPrimary}
      </Text>
    </View>
  );

  return (
    <View style={[s.progressWrap, isMobile && s.progressWrapMobile]}>
      <View style={[s.progressCard, isMobile && s.progressCardMobile]}>
        {isMobile ? (
          <>
            <View style={s.progressTopRowMobile}>
              {avatarEl}
              {bodyEl}
            </View>
            <View style={s.progressFooterMobile}>
              {pillEl}
              <Text style={s.progressTimeMobile} numberOfLines={1}>
                {time}
              </Text>
            </View>
          </>
        ) : (
          <>
            {avatarEl}
            {bodyEl}
            <View style={s.progressRight}>
              {pillEl}
              <Text style={s.progressTime} numberOfLines={1}>
                {time}
              </Text>
            </View>
            <View style={[s.progressExpandHint, { pointerEvents: "none" }]}>
              <ChevronRight size={8} color={Theme.textMuted} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function systemSheetAvatarSeed(content: string): string {
  const m = (content ?? "").match(/\b(TRP[-A-Z0-9]+)\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  const trip = (content ?? "").match(/\b([A-Z]{2,4}\d{2,6})\b/);
  if (trip?.[1]) return trip[1].toUpperCase();
  return "Trip update";
}

function PulseSystemProtocolCard({
  title,
  subtitle,
  displayTime,
  isMobile = false,
}: {
  title: string;
  subtitle: string;
  displayTime: string;
  isMobile?: boolean;
}) {
  if (isMobile) {
    return (
      <View style={[s.ledgerWrap, s.ledgerWrapMobile]}>
        <View style={[s.ledgerCard, s.ledgerCardMobile, s.pulseProtoCardMobile]}>
          <View style={s.ledgerTopRowMobile}>
            <View style={s.pulseProtoIconCol}>
              <View style={s.pulseProtoIconCircle}>
                <Activity size={18} color="#059669" strokeWidth={2.4} />
              </View>
              <View style={s.pulseProtoLiveDot} />
            </View>
            <View style={s.ledgerBody}>
              <Text style={[s.ledgerTitle, s.ledgerTitleMobile]} numberOfLines={4}>
                {title}
              </Text>
              <Text style={[s.ledgerMeta, s.ledgerMetaMobile]} numberOfLines={4}>
                {subtitle}
              </Text>
            </View>
          </View>
          <View style={s.ledgerFooterMobile}>
            <View style={s.pulseProtoBadge}>
              <Text style={s.pulseProtoBadgeText}>SYSTEM DONE</Text>
            </View>
            <Text style={s.ledgerTimeMobile} numberOfLines={1}>
              {displayTime}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.pulseProtoWrap}>
      <View style={s.pulseProtoCard}>
        <View style={s.pulseProtoIconCol}>
          <View style={s.pulseProtoIconCircle}>
            <Activity size={18} color="#059669" strokeWidth={2.4} />
          </View>
          <View style={s.pulseProtoLiveDot} />
        </View>
        <View style={s.pulseProtoDivider} />
        <View style={s.pulseProtoBody}>
          <Text style={s.pulseProtoTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={s.pulseProtoSubtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        </View>
        <View style={s.pulseProtoRight}>
          <View style={s.pulseProtoBadge}>
            <Text style={s.pulseProtoBadgeText}>SYSTEM DONE</Text>
          </View>
          <Text style={s.pulseProtoTime} numberOfLines={1}>
            {displayTime}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ChatSystemEventCard({
  message,
  isMobile = false,
}: {
  message: TripMessageRow;
  isMobile?: boolean;
}) {
  const statusKey = inferStatusFromContent(message.content);
  const cfg = STATUS_ICON_MAP[statusKey] ?? STATUS_ICON_MAP.default;
  const dateUpper = formatTripEventSheetDate(message.created_at);

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const metaLine = `System update · ${dateUpper} · ${cfg.sheetLabel}`;
  const seed = systemSheetAvatarSeed(message.content);

  if (shouldUsePulseProtocolSystemCard(message.content, statusKey)) {
    const tripRef =
      (message.content ?? "").match(/\b(TRP[-A-Z0-9]+)\b/i)?.[1] ??
      (message.content ?? "").match(/\b([A-Z]{2,4}\d{2,6})\b/i)?.[1];
    const subtitle = tripRef
      ? `${tripRef} has reached a destination milestone on the shared trip channel.`
      : `Recorded ${dateUpper} · ${cfg.sheetLabel}.`;

    return (
      <PulseSystemProtocolCard
        title={message.content.trim() || "Trip protocol update"}
        subtitle={subtitle}
        displayTime={displayTime}
        isMobile={isMobile}
      />
    );
  }

  return (
    <TripProgressEventCard
      avatarSeed={seed}
      avatarDotColor={cfg.rightColor}
      title={message.content.trim() || "Trip update"}
      metaLine={metaLine}
      subLine={null}
      rightPrimary={cfg.rightWord}
      rightPrimaryColor={cfg.rightColor}
      time={displayTime}
      isMobile={isMobile}
    />
  );
}
