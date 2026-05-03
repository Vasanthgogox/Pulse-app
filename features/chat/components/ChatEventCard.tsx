import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Truck,
  MapPin,
  XCircle,
  Navigation,
  Clock,
} from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import Theme from "@/constants/Theme";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
} from "@/lib/partyAvatarDisplay";
import type { LedgerEventMetadata, TripMessageRow } from "../types/chat.types";

// ── System event card (trip status changes) ───────────────────────────────────

const STATUS_ICON_MAP: Record<string, { Icon: React.ComponentType<any>; color: string; bg: string }> = {
  assigned:    { Icon: Truck,         color: CHAT_ACCENT, bg: CHAT_ACCENT_SOFT },
  in_progress: { Icon: Navigation,    color: CHAT_ACCENT, bg: CHAT_ACCENT_SOFT },
  picked_up:   { Icon: MapPin,        color: "#f59e0b", bg: "#fffbeb" },
  in_transit:  { Icon: Truck,         color: "#06b6d4", bg: "#ecfeff" },
  at_drop:     { Icon: MapPin,        color: "#10b981", bg: "#ecfdf5" },
  completed:   { Icon: CheckCircle,   color: "#22c55e", bg: "#f0fdf4" },
  cancelled:   { Icon: XCircle,       color: "#ef4444", bg: "#fef2f2" },
  default:     { Icon: Clock,         color: "#94a3b8", bg: "#f8fafc" },
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
  return "default";
}

export function ChatSystemEventCard({ message }: { message: TripMessageRow }) {
  const statusKey = inferStatusFromContent(message.content);
  const { Icon, color, bg } = STATUS_ICON_MAP[statusKey] ?? STATUS_ICON_MAP.default;

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

  return (
    <View style={s.eventCard}>
      <View style={[s.eventIcon, { backgroundColor: bg }]}>
        <Icon size={16} color={color} />
      </View>
      <View style={s.eventBody}>
        <Text style={s.eventContent}>{message.content}</Text>
        <Text style={s.eventTime}>{displayTime}</Text>
      </View>
    </View>
  );
}

// ── Ledger event card (payment / adjustment) ──────────────────────────────────

interface LedgerCardProps {
  message: TripMessageRow;
  currentOrgId: string;
  /** Chat thread party (linked client/supplier name) — fills missing receiver on cash-in rows. */
  conversationPartyName?: string | null;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  addingToBook?: boolean;
  /** Driver / embedded views: show the card UI without add-to-book or dispute actions. */
  readOnly?: boolean;
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

function ledgerDateUpper(iso: string): string {
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
  addingToBook,
  readOnly = false,
}: LedgerCardProps) {
  const meta = message.metadata as LedgerEventMetadata | null;
  if (!meta) return null;

  const isReceiver = meta.receiver_org_id === currentOrgId;
  const isSender = meta.sender_org_id === currentOrgId;

  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowPrefix = flow === "in" ? "+" : "−";
  const isAcknowledged = !!meta.acknowledged_at;
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
  const dateUpper = ledgerDateUpper(message.created_at);
  const metaMid = [paymentModeLabel, meta.category].filter(Boolean).join(" · ") || "—";
  const routeLine = `${fromParty.toUpperCase()} → ${toParty.toUpperCase()}`;

  const isCredit = flow === "in";
  const amountColor = isCredit ? "#047857" : "#be123c";

  return (
    <View style={s.ledgerWrap}>
      <View style={s.ledgerCard}>
        <View style={[s.ledgerAvatarWrap, s.ledgerAvatarWrapAlign]}>
          <View style={[s.ledgerAvatar, { backgroundColor: avatarBg }]}>
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

        <View style={s.ledgerBody}>
          {titleDisplay ? (
            <Text style={s.ledgerTitle} numberOfLines={1}>
              {titleDisplay}
            </Text>
          ) : null}
          <Text style={s.ledgerMeta} numberOfLines={1}>
            {dateUpper}
            {" · "}
            {metaMid}
          </Text>
          <Text style={s.ledgerRoute} numberOfLines={1}>
            {routeLine}
          </Text>
        </View>

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
      ) : !readOnly && isReceiver && !isSender ? (
        <View style={s.ledgerActions}>
          <TouchableOpacity
            style={s.ledgerAddBtn}
            onPress={() => onAddToBook(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            {addingToBook ? (
              <ActivityIndicator size="small" color="#fff" />
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
  // System event
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
    marginVertical: 4,
  },
  eventIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventBody: { flex: 1, minWidth: 0 },
  eventContent: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    lineHeight: 17,
  },
  eventTime: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 3,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Ledger row — same footprint as system `eventCard` (compact list tile)
  ledgerWrap: {
    alignSelf: "center",
    maxWidth: "85%",
    marginVertical: 4,
  },
  ledgerCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  ledgerMeta: {
    fontSize: 9,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.02,
  },
  ledgerRoute: {
    fontSize: 8,
    fontWeight: "400",
    color: "#94a3b8",
    fontStyle: "italic",
    letterSpacing: 0.15,
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
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.35,
    lineHeight: 17,
  },
  ledgerTimeRight: {
    fontSize: 8,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
});
