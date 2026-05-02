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
  ArrowRight,
  CheckCircle,
  CreditCard,
  Truck,
  MapPin,
  Package,
  XCircle,
  Navigation,
  Clock,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Theme from "@/constants/Theme";
import type { LedgerEventMetadata, TripMessageRow } from "../types/chat.types";

// ── System event card (trip status changes) ───────────────────────────────────

const STATUS_ICON_MAP: Record<string, { Icon: React.ComponentType<any>; color: string; bg: string }> = {
  assigned:    { Icon: Truck,         color: "#3b82f6", bg: "#eff6ff" },
  in_progress: { Icon: Navigation,    color: "#8b5cf6", bg: "#f5f3ff" },
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

  const categoryLabel = String(meta.category ?? "Payment").trim() || "Payment";
  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowColor = flow === "in" ? "#059669" : "#be123c";
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

  const flowHeadline = flow === "in" ? "Payment received" : "Payment sent";
  const stripColors =
    flow === "in"
      ? (["#34d399", "#059669"] as const)
      : (["#fb7185", "#be123c"] as const);
  const cardTintColors =
    flow === "in"
      ? (["#f0fdf4", "#ffffff"] as const)
      : (["#fff1f2", "#ffffff"] as const);
  const iconRingColors =
    flow === "in"
      ? (["#a7f3d0", "#34d399"] as const)
      : (["#fecdd3", "#fb7185"] as const);

  return (
    <View style={s.ledgerCardOuter}>
      <LinearGradient colors={stripColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ledgerAccentStrip} />

      <LinearGradient colors={cardTintColors} style={s.ledgerCardGradient}>
        <View style={s.ledgerCard}>
          <View style={s.ledgerTopRow}>
            <LinearGradient colors={iconRingColors} style={s.ledgerIconRing}>
              <View style={s.ledgerIconInner}>
                <CreditCard size={13} color={flow === "in" ? "#047857" : "#9f1239"} />
              </View>
            </LinearGradient>
            <View style={s.ledgerTitleBlock}>
              <Text style={s.ledgerCategory}>{categoryLabel.toUpperCase()}</Text>
              <Text style={s.ledgerFlowHeadline} numberOfLines={1}>
                {flowHeadline}
              </Text>
            </View>
            <View style={s.ledgerAmountBlock}>
              <Text style={[s.ledgerAmount, { color: flowColor }]} numberOfLines={1}>
                {flowPrefix}
                {amountLabel}
              </Text>
              <Text style={s.ledgerAmountCaption}>{flow === "in" ? "Credited" : "Debited"}</Text>
            </View>
          </View>

          <View style={s.ledgerFlowRow}>
            <Text style={s.ledgerFlowParty} numberOfLines={1}>
              {fromParty}
            </Text>
            <ArrowRight size={11} color="#cbd5e1" />
            <Text style={s.ledgerFlowParty} numberOfLines={1}>
              {toParty || "—"}
            </Text>
          </View>

          <View style={s.ledgerBottomBar}>
            <View style={s.ledgerModePill}>
              <Text style={s.ledgerModePillText}>{paymentModeLabel}</Text>
            </View>
            <View style={s.ledgerBottomRight}>
              {meta.reference_number ? (
                <Text style={s.ledgerRefInline} numberOfLines={1}>
                  #{meta.reference_number}
                </Text>
              ) : null}
              <Text style={s.ledgerTime}>{displayTime}</Text>
            </View>
          </View>

          {meta.notes ? (
            <Text style={s.ledgerNotes} numberOfLines={2}>
              {meta.notes}
            </Text>
          ) : null}

          {isAcknowledged ? (
            <View style={s.ledgerStatus}>
              <CheckCircle size={11} color="#059669" />
              <Text style={[s.ledgerStatusText, { color: "#047857" }]}>Added to book</Text>
            </View>
          ) : isDisputed ? (
            <View style={s.ledgerStatus}>
              <AlertTriangle size={11} color="#d97706" />
              <Text style={[s.ledgerStatusText, { color: "#b45309" }]}>Dispute raised</Text>
            </View>
          ) : !readOnly && isReceiver && !isSender ? (
            <View style={s.ledgerActions}>
              <TouchableOpacity
                style={s.addToBookBtn}
                onPress={() => onAddToBook(message)}
                disabled={addingToBook}
                activeOpacity={0.8}
              >
                {addingToBook ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.addToBookText}>Add to book</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.disputeBtn}
                onPress={() => onDispute(message)}
                disabled={addingToBook}
                activeOpacity={0.8}
              >
                <Text style={s.disputeText}>Dispute</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </LinearGradient>
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

  // Ledger card — compact “statement line” (~half prior height)
  ledgerCardOuter: {
    marginVertical: 3,
    maxWidth: "88%",
    width: "88%",
    alignSelf: "center",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  ledgerAccentStrip: {
    height: 2,
    width: "100%",
  },
  ledgerCardGradient: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  ledgerCard: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148, 163, 184, 0.28)",
    borderTopWidth: 0,
    backgroundColor: "transparent",
  },
  ledgerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ledgerIconRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    padding: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ledgerIconInner: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  ledgerCategory: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  ledgerFlowHeadline: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 1,
    letterSpacing: -0.2,
  },
  ledgerAmountBlock: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: "44%",
  },
  ledgerAmount: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  ledgerAmountCaption: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    marginTop: 1,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  ledgerFlowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148, 163, 184, 0.35)",
  },
  ledgerFlowParty: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    minWidth: 0,
  },
  ledgerBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  ledgerModePill: {
    backgroundColor: "rgba(15, 23, 42, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  ledgerModePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  ledgerBottomRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  ledgerRefInline: {
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
    flexShrink: 1,
  },
  ledgerNotes: {
    fontSize: 10,
    color: "#64748b",
    lineHeight: 13,
    marginTop: 5,
  },
  ledgerActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 7,
  },
  addToBookBtn: {
    flex: 1,
    backgroundColor: Theme.primary,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
  },
  addToBookText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  disputeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fbbf24",
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
  },
  disputeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  ledgerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  ledgerStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  ledgerTime: {
    fontSize: 9,
    color: "#94a3b8",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
